// src/LoginPage.js
// FULL FILE — paste everything below

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { signInWithEmailAndPassword, setPersistence, inMemoryPersistence, updateProfile } from "firebase/auth";

// --- Geofence settings ---
const GEOFENCE_RADIUS_M = 300; // match WorkerDashboard threshold
const GEO_OPTS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
};

// --- Helper: normalize coords from Firestore ---
function getTrackCoords(trackDocData) {
  if (!trackDocData) return { trackLat: undefined, trackLng: undefined };

  let trackLat =
    typeof trackDocData.latitude === "number"
      ? trackDocData.latitude
      : typeof trackDocData.lat === "number"
      ? trackDocData.lat
      : typeof trackDocData.latitude === "string"
      ? parseFloat(trackDocData.latitude)
      : typeof trackDocData.lat === "string"
      ? parseFloat(trackDocData.lat)
      : undefined;

  let trackLng =
    typeof trackDocData.longitude === "number"
      ? trackDocData.longitude
      : typeof trackDocData.lng === "number"
      ? trackDocData.lng
      : typeof trackDocData.longitude === "string"
      ? parseFloat(trackDocData.longitude)
      : typeof trackDocData.lng === "string"
      ? parseFloat(trackDocData.lng)
      : undefined;

  return { trackLat, trackLng };
}

// --- Helper: ensure Firestore users/{uid} exists ---
async function ensureUserDoc(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const newDoc = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      role: 'worker',             // default; set to "admin" in Firestore for owners (e.g., Billy)
      assignedTrack: null,        // you can set this later per worker
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, newDoc);
    return newDoc;
  }

  return snap.data();
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, role } = useAuth(); // not auto-redirecting from here

  useEffect(() => {
    // No auto-redirect on page load anymore (kept as you had it)
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // No "stay logged in" — use memory-only session
      await setPersistence(auth, inMemoryPersistence);

      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = userCredential.user;

      // 🔒 Make sure users/{uid} exists (fixes "User profile not found")
      const userData = await ensureUserDoc(u);

      // (Optional) keep Auth displayName/photo in sync with Firestore if present
      if (
        (userData.displayName && u.displayName !== userData.displayName) ||
        (userData.photoURL && u.photoURL !== userData.photoURL)
      ) {
        await updateProfile(u, {
          displayName: userData.displayName || u.displayName || '',
          photoURL: userData.photoURL || u.photoURL || ''
        });
      }

      const userRole = userData.role;

      if (userRole === "admin") {
        navigate("/admin-dashboard");
        return;
      }

      if (userRole === "worker") {
        const assignedTrack = userData.assignedTrack;
        if (!assignedTrack) {
          setError("No track assigned to your account. Please contact admin.");
          setLoading(false);
          return;
        }

        const trackDoc = await getDoc(doc(db, "tracks", assignedTrack));
        if (!trackDoc.exists()) {
          setError("Track not found. Please contact admin.");
          setLoading(false);
          return;
        }

        const trackData = trackDoc.data();
        const { trackLat, trackLng } = getTrackCoords(trackData);

        if (typeof trackLat !== "number" || typeof trackLng !== "number") {
          console.error("[Geo] Invalid track coords from Firestore:", trackData);
          setError("Track location not set correctly. Please contact admin.");
          setLoading(false);
          return;
        }

        // --- Improved location check with accuracy + retry ---
        const tryLoginWithLocation = () => {
          if (!navigator.geolocation) {
            setError("Geolocation is not supported by your browser.");
            setLoading(false);
            return;
          }

          const finishWithPosition = (coords) => {
            const { latitude, longitude, accuracy } = coords;

            if (typeof latitude !== "number" || typeof longitude !== "number") {
              console.error("[Geo] Invalid user coords:", coords);
              setError("Could not read your GPS position. Please try again.");
              setLoading(false);
              return;
            }

            const distance = getDistanceFromLatLonInMeters(
              latitude,
              longitude,
              trackLat,
              trackLng
            );

            console.log("[Geo] Track:", trackLat, trackLng);
            console.log("[Geo] User:", latitude, longitude, "accuracy(m):", accuracy);
            console.log("[Geo] Distance(m):", Math.round(distance));

            if (distance <= GEOFENCE_RADIUS_M) {
              navigate("/worker-dashboard");
            } else {
              // If accuracy is poor, try a brief watch to refine
              if (accuracy > 100) {
                console.log("[Geo] Accuracy > 100m, starting short watch retry...");
                const watchId = navigator.geolocation.watchPosition(
                  (pos2) => {
                    const { latitude: lat2, longitude: lng2, accuracy: acc2 } = pos2.coords;
                    const d2 = getDistanceFromLatLonInMeters(lat2, lng2, trackLat, trackLng);
                    console.log("[Geo][Retry] User:", lat2, lng2, "acc:", acc2, "dist:", Math.round(d2));

                    if (d2 <= GEOFENCE_RADIUS_M) {
                      navigator.geolocation.clearWatch(watchId);
                      navigate("/worker-dashboard");
                    }
                  },
                  (wErr) => {
                    console.error("[Geo][Retry] watch error", wErr);
                  },
                  { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
                );

                // Stop retry after 8s and show final message if still out of range
                setTimeout(() => {
                  navigator.geolocation.clearWatch(watchId);
                  setError(`You must be at the track to log in. Distance ~${Math.round(distance)}m (acc ~${Math.round(accuracy)}m). Try moving closer and tap login again.`);
                  setLoading(false);
                }, 8000);
              } else {
                setError(`You must be at the track to log in. Distance ~${Math.round(distance)}m (acc ~${Math.round(accuracy)}m).`);
                setLoading(false);
              }
            }
          };

          navigator.geolocation.getCurrentPosition(
            (pos) => finishWithPosition(pos.coords),
            async (err) => {
              console.error("[Geo] getCurrentPosition error", err);
              // Some Safari/iOS cases return error first time; try a quick watch fallback
              try {
                const watchId = navigator.geolocation.watchPosition(
                  (pos2) => {
                    navigator.geolocation.clearWatch(watchId);
                    finishWithPosition(pos2.coords);
                  },
                  (wErr) => {
                    console.error("[Geo] watchPosition error", wErr);
                    setError("Location permission denied or unavailable. Please enable Precise Location for Safari.");
                    setLoading(false);
                  },
                  GEO_OPTS
                );
                // if no fix in 10s, give up
                setTimeout(() => navigator.geolocation.clearWatch(watchId), 10000);
              } catch (e) {
                setError("Location permission denied or unavailable. Please enable Precise Location for Safari.");
                setLoading(false);
              }
            },
            GEO_OPTS
          );
        };

        tryLoginWithLocation();
        return;
      }

      throw new Error("Unknown role");

    } catch (err) {
      console.error(err);
      setError(err.message || 'Login failed.');
      setLoading(false);
    }
  };

  // Distance function
  function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  return (
    <div className="main-wrapper">
      <div className="glass-card">
        <h2 style={{ textAlign: 'center' }}>Login to Kart Force</h2>
        <form onSubmit={handleLogin}>
          <input
            className="input-field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
          {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
