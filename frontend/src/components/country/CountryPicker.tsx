import { useNavigate } from 'react-router-dom';
import { useCountry, type SelectableCountry } from '../../context/CountryContext';

interface CountryOption {
  code: SelectableCountry;
  name: string;
  legalBasis: string;
  path: string;
  /** Jagged narrow ridge for Chile's long Andean spine vs. Colombia's three softer ranges. */
  silhouette: string;
  classes: {
    hoverBorder: string;
    silhouette: string;
    badge: string;
    cta: string;
  };
}

const COUNTRIES: CountryOption[] = [
  {
    code: 'CL',
    name: 'Chile',
    legalBasis: 'Ley 19.799 — firma electrónica',
    path: '/cl',
    silhouette: 'M0 70 L12 40 L22 55 L34 18 L46 50 L58 30 L70 58 L82 25 L94 52 L100 70 Z',
    classes: {
      hoverBorder: 'hover:border-cl-400',
      silhouette: 'text-cl-200',
      badge: 'bg-cl-100 text-cl-700',
      cta: 'text-cl-700',
    },
  },
  {
    code: 'CO',
    name: 'Colombia',
    legalBasis: 'Ley 527 de 1999 — comercio electrónico',
    path: '/co',
    silhouette: 'M0 70 Q14 28 30 48 Q42 20 56 46 Q70 24 84 50 Q94 34 100 50 L100 70 Z',
    classes: {
      hoverBorder: 'hover:border-co-400',
      silhouette: 'text-co-200',
      badge: 'bg-co-100 text-co-ink-800',
      cta: 'text-co-ink-700',
    },
  },
];

interface CountryPickerProps {
  /** Navigate to the country's landing page on selection (default). Set false to stay in place. */
  navigateToLanding?: boolean;
}

export default function CountryPicker({ navigateToLanding = true }: CountryPickerProps) {
  const { setCountry } = useCountry();
  const navigate = useNavigate();

  const handleSelect = (code: SelectableCountry, path: string) => {
    setCountry(code);
    if (navigateToLanding) navigate(path);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid sm:grid-cols-3 gap-5">
        {COUNTRIES.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => handleSelect(option.code, option.path)}
            className={`group relative overflow-hidden rounded-2xl border-2 border-gray-200 bg-white p-6 text-left transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-quantum-400 ${option.classes.hoverBorder}`}
          >
            <svg
              viewBox="0 0 100 70"
              preserveAspectRatio="none"
              className={`absolute bottom-0 left-0 w-full h-16 opacity-70 transition-opacity group-hover:opacity-100 ${option.classes.silhouette}`}
              aria-hidden="true"
            >
              <path d={option.silhouette} fill="currentColor" />
            </svg>
            <div className="relative">
              <span
                className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm mb-4 ${option.classes.badge}`}
              >
                {option.code}
              </span>
              <h3 className="text-lg font-semibold text-gray-900">{option.name}</h3>
              <p className="text-sm text-gray-500 mt-1 h-10">{option.legalBasis}</p>
              <span
                className={`inline-flex items-center text-sm font-medium mt-3 group-hover:underline ${option.classes.cta}`}
              >
                Elegir {option.name} →
              </span>
            </div>
          </button>
        ))}

        <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-left opacity-70">
          <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-gray-200 text-gray-500 text-xs font-medium">
            Próximamente
          </div>
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-200 text-gray-500 font-bold text-sm mb-4">
            ES
          </span>
          <h3 className="text-lg font-semibold text-gray-500">España</h3>
          <p className="text-sm text-gray-400 mt-1 h-10">Reglamento eIDAS — en preparación</p>
        </div>
      </div>
    </div>
  );
}
