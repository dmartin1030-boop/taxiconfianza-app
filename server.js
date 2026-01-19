const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// Middleware para leer JSON y servir archivos estáticos
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// 1. Configuración del Pool de Conexiones (Optimizado para Hostinger/Railway)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Verificación de conexión a la base de datos
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err.message);
    } else {
        console.log('✅ Conexión a Base de Datos exitosa.');
        connection.release();
    }
});

// 2. Rutas de Navegación (HTML)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

// Rutas de Dashboards (Diferenciadas)
app.get('/dashboard-propietario.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard-propietario.html')));
app.get('/dashboard-conductor.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard-conductor.html')));

// 3. API - Listado de conductores para el Propietario
app.get('/api/conductores', (req, res) => {
    const query = 'SELECT nombres, apellidos, email, celular, tipo FROM usuarios WHERE tipo = "CONDUCTOR"';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, conductores: results });
    });
});

// 4. API - Registro de Usuarios (Propietario o Conductor)
app.post('/register', (req, res) => {
    const { nombre, apellido, celular, email, password, rol } = req.body;
    
    // Validar que el rol sea válido
    const rolValido = rol.toUpperCase(); 
    const query = 'INSERT INTO usuarios (nombres, apellidos, celular, email, password_hash, tipo) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.query(query, [nombre, apellido, celular, email, password, rolValido], (err) => {
        if (err) {
            console.error('Error al registrar usuario:', err);
            return res.status(500).json({ success: false, error: 'Este correo ya está registrado o hay un error en los datos.' });
        }
        res.json({ success: true, message: 'Registro exitoso' });
    });
});

// 5. API - Login (Punto Crítico para Redirección)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT nombres, apellidos, email, tipo FROM usuarios WHERE email = ? AND password_hash = ?';
    
    db.query(query, [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        if (results.length > 0) {
            const user = results[0];
            // Enviamos los datos necesarios al frontend
            res.json({ 
                success: true, 
                user: {
                    nombres: user.nombres,
                    apellidos: user.apellidos,
                    email: user.email,
                    tipo: user.tipo.toLowerCase() // 'propietario' o 'conductor'
                }
            });
        } else {
            res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});
// 6. Configuración del Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor TaxiConfianza corriendo en puerto ${PORT}`);
});
