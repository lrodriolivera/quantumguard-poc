import { Shield } from 'lucide-react';
import CountryPicker from '../components/country/CountryPicker';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-quantum-50 mb-6">
            <Shield className="w-7 h-7 text-quantum-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Firma post-cuántica, con validez legal en tu país
          </h1>
          <p className="text-gray-500 text-lg">
            Cada país tiene su propia ley y su propia autoridad certificadora. Elige el tuyo
            para empezar a firmar.
          </p>
        </div>

        <CountryPicker />
      </div>
    </div>
  );
}
