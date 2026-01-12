const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// 1. Configuración de Middlewares
app.use(express.json());
// Sirve tus archivos HTML, CSS y JS desde la raíz
app.use(express.static(path.join(__dirname, '/')));

// 2. Conexión a la Base de Datos (Hostinger vía Railway)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error('Error conectando a Hostinger:', err);
        return;
    }
    console.log('¡Conectado exitosamente a la base de datos!');
});

// 3. RUTAS DE NAVEGACIÓN (Evitan el error "Not Found")
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Register.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Login.html'));
});

// 4. RUTA DE REGISTRO (Ajustada a tu BD en Hostinger)
app.post('/register', (req, res) => {
    const { nombre, email, password, rol } = req.body;
    
    // IMPORTANTE: 'nombres', 'password_hash' y 'tipo' coinciden con tu imagen
    const query = 'INSERT INTO usuarios (nombres, email, password_hash, tipo) VALUES (?, ?, ?, ?)';
    
    // Convertimos el rol a MAYÚSCULAS para que el ENUM de tu BD lo acepte
    const rolMayus = rol.toUpperCase();

    db.query(query, [nombre, email, password, rolMayus], (err, result) => {
        if (err) {
            console.error('Error al insertar en Hostinger:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: 'Usuario registrado con éxito' });
    });
});

// 5. RUTA DE LOGIN (Ajustada a tu BD en Hostinger)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    // Buscamos usando 'password_hash'
    const query = 'SELECT * FROM usuarios WHERE email = ? AND password_hash = ?';
    
    db.query(query, [email, password], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        
        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});

// 6. Lanzamiento del Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de TaxiConfianza corriendo en puerto ${PORT}`);
});
