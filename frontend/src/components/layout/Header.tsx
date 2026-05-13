import { Link, useNavigate } from 'react-router-dom';
import { Shield, User, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <Shield className="w-8 h-8 text-quantum-600" />
            <span className="text-xl font-bold text-gray-900">QuantumGuard</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-gray-600 hover:text-quantum-600 transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/sign"
                  className="text-gray-600 hover:text-quantum-600 transition-colors"
                >
                  Firmar
                </Link>
                <Link
                  to="/verify"
                  className="text-gray-600 hover:text-quantum-600 transition-colors"
                >
                  Verificar
                </Link>
                <Link
                  to="/documents"
                  className="text-gray-600 hover:text-quantum-600 transition-colors"
                >
                  Documentos
                </Link>

                {/* User Menu */}
                <div className="flex items-center space-x-4 pl-4 border-l border-gray-200">
                  <Link
                    to="/profile"
                    className="flex items-center space-x-2 text-gray-600 hover:text-quantum-600"
                  >
                    <User className="w-5 h-5" />
                    <span>{user?.firstName || 'Usuario'}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                    title="Cerrar sesion"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Link to="/login">
                  <Button variant="ghost">Iniciar Sesion</Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary">Registrarse</Button>
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-gray-600"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            {isAuthenticated ? (
              <div className="space-y-3">
                <Link
                  to="/dashboard"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/sign"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Firmar Documento
                </Link>
                <Link
                  to="/verify"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Verificar Firma
                </Link>
                <Link
                  to="/documents"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mis Documentos
                </Link>
                <Link
                  to="/profile"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mi Perfil
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Cerrar Sesion
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <Link
                  to="/login"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Iniciar Sesion
                </Link>
                <Link
                  to="/register"
                  className="block px-3 py-2 text-quantum-600 font-medium hover:bg-quantum-50 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Registrarse
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
