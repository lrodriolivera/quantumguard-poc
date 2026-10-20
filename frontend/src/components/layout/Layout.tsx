import { Outlet, Link } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-500 text-sm">
              &copy; 2026 QuantumGuard AI - Postcuantica. Todos los derechos reservados.
            </p>
            <p className="text-gray-400 text-sm mt-2 md:mt-0">
              Firmas digitales post-cuanticas seguras con ML-DSA (Dilithium)
            </p>
          </div>
          <div className="flex justify-center md:justify-start gap-4 mt-4 pt-4 border-t border-gray-100">
            <Link to="/terminos" className="text-gray-400 hover:text-gray-600 text-xs">
              Términos de Uso
            </Link>
            <Link to="/privacidad" className="text-gray-400 hover:text-gray-600 text-xs">
              Política de Privacidad
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
