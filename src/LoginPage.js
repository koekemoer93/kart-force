// src/LoginPage.js
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence, browserLocalPersistence, inMemoryPersistence } from "firebase/auth";


function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, role } = useAuth();

  useEffect(() => {
    if (user && role === "admin") navigate("/admin-dashboard");
    if (user && role === "worker") navigate("/worker-dashboard");
  }, [user, role, navigate]);

  const handleLogin = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
      await setPersistence(auth, inMemoryPersistence);

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) throw new Error("User profile not found");

      const userData = userDoc.data();
      const userRole = userData.role;

      if (userRole === "admin") {
        navigate("/admin-dashboard");
      } else if (userRole === "worker") {
        const assignedTrack = userData.assignedTrack;
        const trackDoc = await getDoc(doc(db, "tracks", assignedTrack));
        if (!trackDoc.exists()) throw new Error("Track not found");

        const trackData = trackDoc.data();
        const trackLat = trackData.latitude;
        const trackLng = trackData.longitude;

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const distance = getDistanceFromLatLonInMeters(
              position.coords.latitude,
              position.coords.longitude,
              trackLat,
              trackLng
            );

            if (distance <= 200) {
              navigate("/worker-dashboard");
            } else {
              setError("You must be at the track to log in.");
            }

            setLoading(false);
          },
          (err) => {
            console.error("GPS Error", err);
            setError("Location permission denied or unavailable.");
            setLoading(false);
          }
        );
      } else {
        throw new Error("Unknown role");
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Distance function
  function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

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
