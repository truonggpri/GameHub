import { Link } from 'react-router-dom';
import Navbar from './Navbar';

export default function ComingSoon() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-white selection:text-black animate-page-in">
      <Navbar />
      
      <div className="fixed inset-0 z-0 bg-grid-pattern opacity-10 animate-fade-in"></div>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-35 bg-[radial-gradient(circle_at_15%_20%,rgba(250,204,21,0.16),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(56,189,248,0.16),transparent_28%)] animate-gradient-pan"></div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/5 text-xs font-mono text-yellow-500 animate-pop-in">
          🚧 UNDER DEVELOPMENT
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter mb-6 animate-fade-up" style={{ '--delay': '70ms' }}>
          COMING <br />
          <span className="text-zinc-700">SOON</span>
        </h1>
        
        <p className="text-xl text-zinc-400 max-w-lg mx-auto mb-12 animate-fade-up" style={{ '--delay': '140ms' }}>
          Our developers are currently battling bugs and drinking excessive amounts of coffee to bring you this game.
        </p>

        <Link 
          to="/" 
          className="neo-brutalism bg-white text-black px-8 py-4 font-bold tracking-wide hover:bg-zinc-200 inline-block button-lift animate-fade-up"
          style={{ '--delay': '210ms' }}
        >
          RETURN TO BASE
        </Link>
      </div>
    </div>
  );
}
