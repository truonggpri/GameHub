import { useNavigate } from 'react-router-dom';
import PokemonGame from '../components/PokemonGame.jsx';

const PokemonPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white hover:text-yellow-400 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium">Quay lại GameHub</span>
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-bold text-white">Pokemon Battle</h1>
          </div>
          
          <div className="w-32"></div>
        </div>
      </div>

      {/* Game Container */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ height: 'calc(100vh - 120px)', minHeight: '600px' }}>
          <PokemonGame />
        </div>
      </div>

      {/* Instructions */}
      <div className="max-w-4xl mx-auto p-4 mt-4">
        <div className="bg-gray-800 rounded-xl p-4 text-gray-300 text-sm">
          <h3 className="font-bold text-white mb-2">🎮 Hướng dẫn chơi:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Chọn Pokemon từ danh sách 12 loại khác nhau</li>
            <li>Mỗi Pokemon có 4 kỹ năng riêng biệt</li>
            <li>Hệ thống khắc chế: Lửa {'>'} Cỏ {'>'} Nước {'>'} Lửa</li>
            <li>Chiến thắng để nhận XP và Coins</li>
            <li>Stats được lưu lại sau mỗi trận đấu</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PokemonPage;
