import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import PGs from './pages/PGs'
import Dashboard from './pages/Dashboard'
import CRM from './pages/CRM'

function PrivateRoute({ children }) {
  return sessionStorage.getItem('auth') ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/pgs" element={<PrivateRoute><PGs /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/crm" element={<PrivateRoute><CRM /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
