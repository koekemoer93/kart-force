// src/WorkerDashboard.js
import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp
} from 'firebase/firestore';

function WorkerDashboard() {
  const { user, displayName } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [trackCoords, setTrackCoords] = useState(null);
  const [distanceToTrack, setDistanceToTrack] = useState(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockStatusMsg, setClockStatusMsg] = useState('');

  // Get user's GPS location
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationError('');
      },
      (error) => {
        setLocationError('Unable to retrieve your location. Please allow location access.');
      }
    );
  }, []);

  // Fetch tasks and track location
  useEffect(() => {
    async function fetchTasksAndTrackCoords() {
      if (!user) return;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) return;

      const { assignedTrack, role } = userDoc.data();
      const taskDoc = await getDoc(doc(db, "tracks", assignedTrack, "templates", role));
      if (taskDoc.exists()) {
        setTasks(taskDoc.data().tasks || []);
      } else {
        setTasks([]);
      }

      const trackDoc = await getDoc(doc(db, "tracks", assignedTrack));
      if (trackDoc.exists()) {
        setTrackCoords({
          latitude: trackDoc.data().latitude,
          longitude: trackDoc.data().longitude,
        });
      }

      setLoading(false);
    }

    fetchTasksAndTrackCoords();
  }, [user]);

  // Calculate distance to track
  useEffect(() => {
    if (userLocation && trackCoords) {
      const distance = getDistanceFromLatLonInMeters(
        userLocation.latitude,
        userLocation.longitude,
        trackCoords.latitude,
        trackCoords.longitude
      );
      setDistanceToTrack(distance);
    }
  }, [userLocation, trackCoords]);

  function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Fetch today's clock in/out status
  useEffect(() => {
    if (!user) return;

    async function fetchClockStatus() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(today);

      const logsRef = collection(db, "users", user.uid, "clockLogs");
      const q = query(logsRef, where("timestamp", ">=", startOfDay));
      const querySnapshot = await getDocs(q);

      let isIn = false;
      let lastLog = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!lastLog || data.timestamp.seconds > lastLog.timestamp.seconds) {
          lastLog = data;
        }
      });

      if (lastLog && lastLog.type === "in") isIn = true;
      setClockedIn(isIn);
      setClockStatusMsg(isIn ? "You are clocked in" : "You are not clocked in");
    }

    fetchClockStatus();
  }, [user]);

  // Handle clock in/out button click
  async function handleClockButton() {
    if (!user || !userLocation) return;
    setClockLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = Timestamp.fromDate(today);

    const logsRef = collection(db, "users", user.uid, "clockLogs");
    const q = query(logsRef, where("timestamp", ">=", startOfDay));
    const querySnapshot = await getDocs(q);

    let isCurrentlyIn = false;
    let lastLog = null;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (!lastLog || data.timestamp.seconds > lastLog.timestamp.seconds) {
        lastLog = data;
      }
    });

    if (lastLog && lastLog.type === "in") isCurrentlyIn = true;

    const newType = isCurrentlyIn ? "out" : "in";
    const msg = newType === "in" ? "You are clocked in" : "You are clocked out";

    await addDoc(logsRef, {
      type: newType,
      timestamp: Timestamp.now(),
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    });

    setClockedIn(!isCurrentlyIn);
    setClockStatusMsg(msg);
    setClockLoading(false);
  }

  if (loading) {
    return (
      <div className="main-wrapper">
        <div className="glass-card">
          <p>Loading your tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrapper" style={{ minHeight: "100vh", alignItems: "center", justifyContent: "center", display: "flex" }}>
      {locationError ? (
        <div className="glass-card" style={{
          background: "rgba(30, 30, 30, 0.92)",
          color: "#ff7070",
          border: "1.5px solid #ff7070",
          fontWeight: "bold",
          padding: 32,
          textAlign: "center",
          maxWidth: 420,
          minWidth: 320,
          boxShadow: "0 6px 32px 0 rgba(0,0,0,0.4)",
          fontSize: 20,
          margin: "auto"
        }}>
          {locationError}
          <div style={{ marginTop: 24, fontSize: 16, color: "#fff", opacity: 0.8 }}>
            Please allow location access in your browser settings and refresh the page.<br /><br />
            <span style={{ fontWeight: 400, fontSize: 15, color: "#ccc" }}>
              If you see this on desktop, try on your phone at the track for full features.
            </span>
          </div>
        </div>
      ) : distanceToTrack !== null && distanceToTrack > 300 ? (
        <div className="glass-card" style={{
          background: "rgba(30,30,30,0.94)",
          color: "#fff",
          border: "2px solid #ffb020",
          fontWeight: "bold",
          margin: "0 auto 24px auto",
          padding: 24,
          textAlign: "center",
          maxWidth: 420,
          fontSize: 18,
        }}>
          <span style={{ color: "#ffb020" }}>You are not at your assigned track location.</span>
          <br /><br />
          Please move within 300m of your track to view your tasks and clock in/out.<br />
          <span style={{ fontSize: 15, opacity: 0.75 }}>
            Current distance: {Math.round(distanceToTrack)} meters
          </span>
        </div>
      ) : (
        <div className="glass-card">
          <h2>Welcome, {displayName || "Worker"}!</h2>
          <h3>Today's Tasks</h3>
          {tasks.length === 0 ? (
            <p>No tasks found for your track/role.</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.id} style={{ margin: "16px 0", fontSize: 18 }}>
                  <input type="checkbox" disabled />
                  {" "}
                  {task.name}
                </li>
              ))}
            </ul>
          )}

          {/* Clock In/Out Section */}
          <div style={{ marginTop: 30, textAlign: 'center' }}>
            <button
              className="button-primary"
              style={{
                padding: "12px 32px",
                fontSize: 18,
                borderRadius: 14,
                fontWeight: 600,
                background: clockedIn ? "#232e1f" : "#215b37",
                color: "#fff",
                border: "none",
                opacity: clockLoading ? 0.7 : 1,
                cursor: clockLoading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 12px 0 rgba(0,0,0,0.14)"
              }}
              disabled={clockLoading}
              onClick={handleClockButton}
            >
              {clockedIn ? "Clock Out" : "Clock In"}
            </button>
            <div style={{
              marginTop: 14,
              color: clockedIn ? "#24ff98" : "#fff",
              fontWeight: 500,
              fontSize: 17
            }}>
              {clockStatusMsg || (clockedIn ? "You are clocked in" : "You are not clocked in")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkerDashboard;
