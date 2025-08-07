// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import WorkerDashboard from './WorkerDashboard';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import TrackDetailsPage from './TrackDetailsPage'; // ✅ ADDED
import TaskHistoryPage from './TaskHistoryPage';


function ProtectedRoute({ children, roleRequired }) {
  const { user, role, loading } = useAuth();

  if (loading) return null; // or a loading spinner
  if (!user) return <Navigate to="/" />;
  if (roleRequired && role !== roleRequired) return <Navigate to="/" />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/task-history" element={<TaskHistoryPage />} />

          
          <Route path="/admin-dashboard"element={
              <ProtectedRoute roleRequired="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/worker-dashboard"
            element={
              <ProtectedRoute roleRequired="worker">
                <WorkerDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/track-details/:trackName"
            element={
              <ProtectedRoute roleRequired="admin">
                <TrackDetailsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
