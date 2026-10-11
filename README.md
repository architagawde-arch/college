# College Feedback Management System (SPES GMFC)

## Run (XAMPP / phpMyAdmin)
1. Start MySQL in XAMPP. In phpMyAdmin run:  DROP DATABASE IF EXISTS cfms; CREATE DATABASE cfms CHARACTER SET utf8mb4;
2. `cd backend` -> copy `.env.example` to `.env` -> `npm install` -> `npm start`   (creates tables + demo data, API on :5000)
3. `cd frontend` -> `npm install` -> `npm run dev`  -> open http://localhost:5173

Logins: admin@gmfc.edu / admin123 · naik@gmfc.edu / faculty123 · archita@gmfc.edu / student123

## Structure
- `frontend/public/admin/*`  Admin dashboard + pages (your design). `live.js` connects them to the API, `admin-patch.css` makes them responsive.
- `frontend/src/*`           React app for Student and Faculty (login, dashboards, forms, fill form).
- `backend/`                 Express + Sequelize + MySQL API.  `database/schema.sql` = same tables for phpMyAdmin.
