import Camera from './components/Camera';

function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold text-green-400 mb-2">Golf AI</h1>
        <p className="text-gray-400">Solo Practice Assistant</p>
      </div>

      <Camera />
    </div>
  )
}

export default App
