// src/LoginPage.js
// ⬇️ Paste this entire file

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { signInWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { isAdmin as isAdminFn, isWorkerLike as isWorkerLikeFn } from './utils/roles';
import SplashOverlay from "./components/SplashOverlay";
import { Link } from 'react-router-dom';

const GEOFENCE_RADIUS_M = 300;
const GEO_OPTS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

function getTrackCoords(trackDocData) {
  if (!trackDocData) return { trackLat: undefined, trackLng: undefined };

  const trackLat =
    typeof trackDocData.latitude === 'number'
      ? trackDocData.latitude
      : typeof trackDocData.lat === 'number'
      ? trackDocData.lat
      : typeof trackDocData.latitude === 'string'
      ? parseFloat(trackDocData.latitude)
      : typeof trackDocData.lat === 'string'
      ? parseFloat(trackDocData.lat)
      : undefined;

  const trackLng =
    typeof trackDocData.longitude === 'number'
      ? trackDocData.longitude
      : typeof trackDocData.lng === 'number'
      ? trackDocData.lng
      : typeof trackDocData.longitude === 'string'
      ? parseFloat(trackDocData.longitude)
      : typeof trackDocData.lng === 'string'
      ? parseFloat(trackDocData.lng)
      : undefined;

  return { trackLat, trackLng };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Use only primitives from context
  const { user, role, profile, loading: authLoading } = useAuth();

  // ✅ Only auto-redirect ADMINS here to avoid loops with GeofenceGate.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    const effectiveRole = (role || profile?.role || '').toLowerCase();

    if (isAdminFn(effectiveRole)) {
      if (location.pathname !== '/admin-dashboard') {
        navigate('/admin-dashboard', { replace: true });
      }
    }
    // Workers stay on the login page until they press Login (geofence will route them).
  }, [authLoading, user, role, profile, navigate, location.pathname]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await setPersistence(auth, inMemoryPersistence);

      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = cred.user;

      // Get latest Firestore user doc for geofence (workers only)
      const userSnap = await getDoc(doc(db, 'users', u.uid));
      const userData = userSnap.exists() ? userSnap.data() : null;

      const rawRole = (userData?.role ?? '').toString().trim().toLowerCase();

      // 👉 IMPORTANT:
      // - Do NOT navigate admins here; admin redirect happens in the useEffect above.
      // - ONLY handle worker-like geofence here.
      if (isWorkerLikeFn(rawRole)) {
        const assignedTrack = (userData?.assignedTrack ?? '').toString().trim();
        if (!assignedTrack) {
          setError('No track assigned to your account. Please contact admin.');
          setLoading(false);
          return;
        }

        const trackDoc = await getDoc(doc(db, 'tracks', assignedTrack));
        if (!trackDoc.exists()) {
          setError('Track not found. Please contact admin.');
          setLoading(false);
          return;
        }

        const trackData = trackDoc.data();
        const { trackLat, trackLng } = getTrackCoords(trackData);

        if (typeof trackLat !== 'number' || typeof trackLng !== 'number') {
          console.error('[Geo] Invalid track coords from Firestore:', trackData);
          setError('Track location not set correctly. Please contact admin.');
          setLoading(false);
          return;
        }

        // --- Geofence: must be within GEOFENCE_RADIUS_M of the track ---
        const finishWithPosition = (coords) => {
          const { latitude, longitude, accuracy } = coords || {};
          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            console.error('[Geo] Invalid user coords:', coords);
            setError('Could not read your GPS position. Please try again.');
            setLoading(false);
            return;
          }

          const distance = haversineMeters(latitude, longitude, trackLat, trackLng);
          console.log('[Geo] Track:', trackLat, trackLng);
          console.log('[Geo] User:', latitude, longitude, 'accuracy(m):', accuracy);
          console.log('[Geo] Distance(m):', Math.round(distance));

          if (distance <= GEOFENCE_RADIUS_M) {
            navigate('/worker-dashboard');
          } else {
            if (accuracy > 100) {
              // Light retry if accuracy is wide
              const watchId = navigator.geolocation.watchPosition(
                (pos2) => {
                  const { latitude: lat2, longitude: lng2, accuracy: acc2 } = pos2.coords;
                  const d2 = haversineMeters(lat2, lng2, trackLat, trackLng);
                  console.log(
                    '[Geo][Retry] User:',
                    lat2,
                    lng2,
                    'acc:',
                    acc2,
                    'dist:',
                    Math.round(d2)
                  );

                  if (d2 <= GEOFENCE_RADIUS_M) {
                    navigator.geolocation.clearWatch(watchId);
                    navigate('/worker-dashboard');
                  }
                },
                (wErr) => console.error('[Geo][Retry] watch error', wErr),
                { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
              );

              setTimeout(() => {
                navigator.geolocation.clearWatch(watchId);
                setError(
                  `You must be at the track to log in. Distance ~${Math.round(
                    distance
                  )}m (acc ~${Math.round(accuracy)}m). Try moving closer and tap login again.`
                );
                setLoading(false);
              }, 8000);
            } else {
              setError(
                `You must be at the track to log in. Distance ~${Math.round(
                  distance
                )}m (acc ~${Math.round(accuracy)}m).`
              );
              setLoading(false);
            }
          }
        };

        if (!navigator.geolocation) {
          setError('Geolocation is not supported by your browser.');
          setLoading(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            finishWithPosition(pos.coords);
          },
          (err) => {
            console.error('[Geo] getCurrentPosition error', err);
            try {
              const watchId = navigator.geolocation.watchPosition(
                (pos2) => {
                  navigator.geolocation.clearWatch(watchId);
                  finishWithPosition(pos2.coords);
                },
                (wErr) => {
                  console.error('[Geo] watchPosition error', wErr);
                  setError('Location permission denied or unavailable. Please enable Precise Location.');
                  setLoading(false);
                },
                GEO_OPTS
              );
              setTimeout(() => navigator.geolocation.clearWatch(watchId), 10000);
            } catch (e) {
              setError('Location permission denied or unavailable. Please enable Precise Location.');
              setLoading(false);
            }
          },
          GEO_OPTS
        );

        return;
      }

      // Unknown role — friendly error (admins will be redirected by useEffect)
      if (!isAdminFn(rawRole)) {
        throw new Error(`Unknown role: "${userData?.role}" — please ask admin to set your role.`);
      }

      // For admins, do nothing here; the useEffect will redirect.
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Login failed.');
      setLoading(false);
    }
  };

  return (
  <>
    {/* Mobile splash (fades after ~1.5s; skipped if authenticated) */}
    <SplashOverlay skipIfAuthenticated={!!user} />

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
            autoComplete="email"
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <div style={{ marginTop: 12, textAlign: 'center' }}>
  <span style={{ color: 'var(--muted, #a1a1aa)', fontSize: 14 }}>
    New here?{' '}
    <Link to="/register" style={{ color: 'var(--text, #f5f5f7)', textDecoration: 'underline' }}>
      Create an account
    </Link>
  </span>
</div>
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          {error && <p style={{ color: 'salmon', marginTop: 12 }}>{error}</p>}
        </form>
      </div>
    </div>
  </>
);


}

