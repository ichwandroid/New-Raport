const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use('/css', express.static(path.join(__dirname, 'public/css'), {
    setHeaders: (res, path) => {
        console.log('Accessing CSS file:', path);
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));
app.use('/js', express.static(path.join(__dirname, 'public/js'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));
app.use(
    session({
        secret: "4n4k54l3H.", // Ganti dengan kunci rahasia yang aman
        resave: false,
        saveUninitialized: false,
    })
);

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
    keyFile: "../connect.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Tambahkan penanganan kesalahan saat menginisialisasi auth
auth.getClient().catch(error => {
    console.error("Error initializing Google Auth:", error);
    process.exit(1); // Keluar dari aplikasi jika ada kesalahan
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1NB38zBlpDdLvtsE_YDzLhXT8vtMQ6a-FUSPeTaec-N0";

// Middleware untuk proteksi halaman
function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect("/login");
}

// Routes
app.get("/", (req, res) => {
    res.redirect("/login");
});

app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async (req, res) => {
    const { fullname, username, password, whatsapp, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "Users!A:E",
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[`AS${Date.now()}`, fullname, username, hashedPassword, whatsapp, role]],
            },
        });

        res.redirect("/login");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error registering user.");
    }
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Users!A:F",
        });

        const rows = response.data.values;
        if (!rows) return res.status(400).send("No users found.");

        // Cari user berdasarkan username (username ada di kolom kedua [index 1])
        const user = rows.find((row) => row[2] === username);
        if (!user) return res.status(400).send("Invalid username or password.");

        // Password ada di kolom ketiga [index 2]
        const isMatch = await bcrypt.compare(password, user[3]);
        if (!isMatch) return res.status(400).send("Invalid username or password.");

        // Set session dengan data yang benar
        req.session.user = {
            id: user[0],         // ID di kolom pertama [index 0]
            username: user[2],    // Username di kolom kedua [index 1]
            role: user[5]        // Role di kolom kelima [index 4]
        };
        res.redirect("/dashboard");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error logging in.");
    }
});

// ambil data guru
app.get("/data-guru", ensureAuthenticated, async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Users!A2:H",
        });

        const rows = response.data.values || [];
        const users = rows.map(row => ({
            id: row[0],
            fullname: row[1],
            username: row[2],
            password: row[3],
            whatsapp: row[4],
            role: row[5],
            status: row[6],
            kelas: row[7]
        }));

        if (req.session.user.role === 'operator') {
            res.render("dataGuru", {
                username: req.session.user.username,
                user: req.session.user,
                users: users // Kirim data pengguna ke tampilan
            });
        } else {
            res.render("dataGuru", {
                username: req.session.user.username,
                user: req.session.user,
                users: [] // Kosongkan data pengguna untuk non-admin
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading data guru.");
    }
});

// ambil data siswa
app.get("/data-siswa", ensureAuthenticated, async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Data Siswa!A2:H",
        });

        const rows = response.data.values || [];
        const siswa = rows.map(row => ({
            nis: row[0],
            nisn: row[1],
            nik: row[2],
            namalengkap: row[3],
            kelas: row[4],
            namakelas: row[5],
            namapanggilan: row[6],
            jeniskelamin: row[7],
        }));

        res.render("dataSiswa", {
            user: req.session.user,
            currentPage: 'data-siswa',
            siswa: siswa
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading data siswa.");
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).send("Error logging out.");
        res.redirect("/login");
    });
});

// Edit pengguna
app.post("/users/edit", ensureAuthenticated, async (req, res) => {
    const { id, fullname, username, whatsapp, role, status, kelas } = req.body;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Users!A:H",
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === id);

        if (rowIndex !== -1) {
            rows[rowIndex][1] = fullname;
            rows[rowIndex][2] = username;
            rows[rowIndex][4] = whatsapp;
            rows[rowIndex][5] = role;
            rows[rowIndex][7] = kelas;

            // Periksa apakah status ada dan merupakan array
            if (Array.isArray(status)) {
                rows[rowIndex][6] = status.join(", "); // Simpan status sebagai string
            } else {
                rows[rowIndex][6] = status; // Jika tidak ada status, simpan sebagai string kosong
            }

            // Periksa apakah kelas ada dan merupakan array
            if (Array.isArray(kelas)) {
                rows[rowIndex][7] = kelas.join(", "); // Simpan kelas sebagai string
            } else {
                rows[rowIndex][7] = kelas; // Jika tidak ada kelas, simpan sebagai string kosong
            }

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Users!A${rowIndex + 1}:H${rowIndex + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values: [rows[rowIndex]],
                },
            });
        }

        // Redirect ke data guru dan arahkan ke tabel data pengguna
        res.redirect("/data-guru");

    } catch (error) {
        console.error(error);
        res.status(500).send("Error editing user.");
    }
});

// Hapus pengguna
app.post("/users/delete/:id", ensureAuthenticated, async (req, res) => {
    const { id } = req.params;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Users!A:H",
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === id);

        if (rowIndex !== -1) {
            // Hapus baris dari data lokal
            rows.splice(rowIndex, 1);

            // Kosongkan seluruh sheet
            await sheets.spreadsheets.values.clear({
                spreadsheetId: SPREADSHEET_ID,
                range: "Users!A:H",
            });

            // Tulis ulang data tanpa baris yang dihapus
            if (rows.length > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "Users!A:H",
                    valueInputOption: "USER_ENTERED",
                    requestBody: {
                        values: rows,
                    },
                });
            }
        }

        res.redirect("/data-guru");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error deleting user.");
    }
});

// Tambahkan route untuk mengupdate password
app.post("/users/update-password", ensureAuthenticated, async (req, res) => {
    const { id, newPassword } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Users!A:F",
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === id);

        if (rowIndex !== -1) {
            rows[rowIndex][3] = hashedPassword; // Update password di kolom yang sesuai

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Users!A${rowIndex + 1}:F${rowIndex + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values: [rows[rowIndex]],
                },
            });
        }

        res.redirect("/data-guru");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error updating password.");
    }
});

app.get('/data-siswa', ensureAuthenticated, (req, res) => {
    res.render('dataSiswa', {
        user: req.session.user,
        currentPage: 'data-siswa'
    });
});

app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        user: req.session.user,
        currentPage: 'dashboard'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
