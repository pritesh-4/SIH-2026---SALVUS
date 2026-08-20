import { Routes, Route } from 'react-router-dom'

const App = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500 selection:text-white">
      <Routes>
        <Route
          path="/"
          element={
            <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
                Salvus
              </h1>
              <p className="mt-2 text-sm text-slate-400 max-w-md">
                AI Hackathon platform frontend base configured with React Router, Tailwind CSS, and Framer Motion.
              </p>
            </main>
          }
        />
        {/* Add more routes here */}
      </Routes>
    </div>
  )
}

export default App
