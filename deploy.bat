@echo off
echo Starting servers...

start cmd /k "npm run server"
echo Socket.io server starting...

start cmd /k "npm run yjs-server"
echo Yjs collaborative editing server starting...

timeout /t 5

echo Starting web application...
start cmd /k "npm run dev"

echo All servers started successfully!
echo Access the application at http://localhost:5173 