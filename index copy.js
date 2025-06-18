const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const driverRoutes = require('./routes/driverRoutes');
const db = require('./config/db');
const bcrypt = require('bcryptjs'); // Import bcryptjs
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());



app.post('/api/drivers/register', async (req, res) => {
  const {
    name,
    email,
    phoneNumber,
    password,
    rcNumber,
    fcDate,
    insuranceNumber,
    insuranceExpiryDate,
    drivingLicense,
    drivingLicenseExpiryDate,
    aadharNumber // not saved in DB (remove or add to schema if needed)
  } = req.body;

  if (!name || !email || !phoneNumber || !password) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(`
      INSERT INTO drivers 
        (name, email, phone, password, rc_number, fc_expiry, insurance_number, insurance_expiry, driving_license, dl_expiry) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      name,
      email,
      phoneNumber,
      hashedPassword,
      rcNumber,
      fcDate,
      insuranceNumber,
      insuranceExpiryDate,
      drivingLicense,
      drivingLicenseExpiryDate
    ]);

    res.status(201).json({ message: 'Driver registered successfully', driverId: result.insertId });

  } catch (err) {
    console.error('Error inserting driver:', err);
    res.status(500).json({ message: 'Database insert failed' });
  }
});



app.post('/api/drivers/check-exists', async (req, res) => {
  const { email, phoneNumber, rcNumber, insuranceNumber } = req.body;

  console.log(email, phoneNumber, rcNumber, insuranceNumber)

  try {
    const [rows] = await db.query(`
      SELECT email, phone, rc_number, insurance_number FROM drivers 
      WHERE email = ? OR phone = ? OR rc_number = ? OR insurance_number = ?`,
      [email, phoneNumber, rcNumber, insuranceNumber]);

    const exists = {
      email: rows.some(r => r.email === email),
      phoneNumber: rows.some(r => r.phoneNumber === phoneNumber),
      rcNumber: rows.some(r => r.rcNumber === rcNumber),
      insuranceNumber: rows.some(r => r.insuranceNumber === insuranceNumber),
    };

    res.json(exists);
  } catch (err) {
    console.error('Error checking existence:', err);
    res.status(500).json({ message: 'Error checking existing values' });
  }
});

// Login

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  handleLogin(email, password)
    .then(({ token, user }) => {
      res.status(200).json({ token, user });
    })
    .catch((err) => {
      console.error(err);
      res.status(err.status || 500).json({ message: err.message || 'Login failed' });
    });
});

// ✅ This function returns a Promise
function handleLogin(email, password) {
  return new Promise(async (resolve, reject) => {
    try {
      const [rows] = await db.query('SELECT * FROM drivers WHERE email = ?', [email]);

      if (rows.length === 0) {
        return reject({ status: 401, message: 'Invalid email or password' });
      }

      const driver = rows[0];
      const isMatch = await bcrypt.compare(password, driver.password);

      if (!isMatch) {
        return reject({ status: 401, message: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: driver.id, email: driver.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      resolve({ token, user: driver });
    } catch (error) {
      reject({ status: 500, message: 'Login failed', error });
    }
  });
}


// Get driver status by email
app.get('/api/drivers/status/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const [rows] = await db.query('SELECT status FROM drivers WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    return res.json({ status: rows[0].status });
  } catch (err) {
    console.error('Error fetching driver status:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/trips/status/:email', async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const [trips] = await db.query(`
      SELECT * FROM trips WHERE driverEmail = ?
      AND (status = 'accepted' OR status = 'WIP')
    `, [email]);

    const acceptedTrips = trips.filter(trip => trip.status === 'accepted');
    const wipTrips = trips.filter(trip => trip.status === 'WIP');

    res.json({ acceptedTrips, wipTrips });
  } catch (err) {
    console.error('Error fetching trips:', err);
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
});

app.get('/api/drivers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    db.query('SELECT * FROM drivers WHERE id = ?', [id], (err, results) => {
      if (err) {
        console.error('MySQL Error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (results.length === 0) {
        console.log('No driver found with id:', id);
        return res.status(404).json({ error: 'Driver not found' });
      }

      res.json(results[0]);
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
});

app.put('/api/drivers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    db.query('UPDATE drivers SET ? WHERE id = ?', [updatedData, id], (err, results) => {
      if (err) throw err;

      res.json({ message: 'Driver updated successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
});

// GET all trips
app.get('/api/trips', async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM trips', (error, results) => {
        if (error) {
          return reject(error);
        }
        resolve(results);
      });
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/trips/:id', (req, res) => {
  const tripId = req.params.id;

  db.query('SELECT * FROM trips WHERE id = ?', [tripId], (err, results) => {
    if (err) {
      console.error('Error fetching trip:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.status(200).json(results[0]);
  });
});

// PUT /api/trips/:id/complete
app.put('/api/trips/:id/complete', (req, res) => {
  const tripId = req.params.id;

  const {
    startMeter,
    endMeter,
    luggage,
    pet,
    toll,
    hills,
    totalKm,
    finalKm,
    finalBill
  } = req.body;

  const sql = `
    UPDATE trips SET 
      startMeter = ?,
      endMeter = ?,
      luggage = ?,
      pet = ?,
      toll = ?,
      hills = ?,
      totalKm = ?,
      finalKm = ?,
      finalBill = ?,
      status = 'completed'
    WHERE id = ?
  `;

  const values = [
    startMeter,
    endMeter,
    luggage,
    pet,
    toll,
    hills,
    totalKm,
    finalKm,
    finalBill,
    tripId
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error updating trip:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }

    res.json({ message: 'Trip marked as completed successfully' });
  });
});


app.put('/api/trips/:id/accept', (req, res) => {
  const tripId = req.params.id;
  const { driverEmail } = req.body;

  // Assuming you're storing acceptedDrivers as comma-separated string (e.g., "a@gmail.com,b@gmail.com")
  db.query('SELECT driverEmail FROM trips WHERE id = ?', [tripId], (err, results) => {
    if (err) return res.status(500).json({ message: 'DB fetch error' });

    let currentDrivers = results[0]?.acceptedDrivers || '';
    let updatedDrivers = currentDrivers
      ? currentDrivers.split(',').includes(driverEmail)
        ? currentDrivers
        : currentDrivers + ',' + driverEmail
      : driverEmail;

    db.query(
      'UPDATE trips SET driverEmail = ?, status = ? WHERE id = ?',
      [updatedDrivers, 'accept', tripId],
      (err) => {
        if (err) return res.status(500).json({ message: 'DB update error' });
        res.status(200).json({ message: 'Trip accepted successfully' });
      }
    );
  });
});

app.get('/api/trips/accepted', (req, res) => {
  const { driverEmail } = req.query;

  if (!driverEmail) {
    return res.status(400).json({ message: 'driverEmail is required' });
  }

  const query = 'SELECT * FROM trips WHERE status = ? AND driverEmail = ?';
  db.query(query, ['accept', driverEmail], (err, results) => {
    if (err) {
      console.error('Error fetching accepted trips:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.status(200).json(results);
  });
});


app.put('/api/trips/:id/start', (req, res) => {
  const tripId = req.params.id;

  const query = 'UPDATE trips SET status = ? WHERE id = ?';
  db.query(query, ['WIP', tripId], (err, result) => {
    if (err) {
      console.error('Error starting trip:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.status(200).json({ message: 'Trip started successfully' });
  });
});

app.get('/api/trips/wip/:driverEmail', (req, res) => {
  const { driverEmail } = req.params;

  const query = 'SELECT * FROM trips WHERE status = ? AND driverEmail = ?';
  db.query(query, ['WIP', driverEmail], (err, results) => {
    if (err) {
      console.error('Error fetching WIP trips:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.status(200).json(results);
  });
});

app.put('/api/trips/update-field', (req, res) => {
  const { tripId, field, value } = req.body;

  if (!tripId || !field) {
    return res.status(400).json({ message: "Missing tripId or field" });
  }

  // List of allowed fields for security
  const allowedFields = ['startMeter', 'endMeter', 'luggage', 'pet', 'toll', 'hills'];

  if (!allowedFields.includes(field)) {
    return res.status(400).json({ message: "Invalid field name" });
  }

  const query = `UPDATE trips SET ${field} = ? WHERE id = ?`;

  db.query(query, [value, tripId], (err, result) => {
    if (err) {
      console.error("Error updating trip field:", err);
      return res.status(500).json({ message: "Server error" });
    }

    res.status(200).json({ message: "Trip updated successfully" });
  });
});

app.post('/api/bills', (req, res) => {
  const data = req.body;

  const sql = `
    INSERT INTO bills (
      driverEmail, customerName, phone,
      pickupLocation, dropLocation,
      pickupDate, pickupTime, tripType,
      startMeter, endMeter, totalKm, finalKm, kmPrice, totalKmPrice,
      luggageCharge, petCharge, tollCharge, hillsCharge, bettaCharge,
      stateCharge, totalEnteredCharges, finalBill, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    data.driverEmail, data.customerName, data.phone,
    data.pickupLocation, data.dropLocation,
    data.pickupDate, data.pickupTime, data.tripType,
    data.startMeter, data.endMeter, data.totalKm, data.finalKm, data.kmPrice, data.totalKmPrice,
    data.luggageCharge, data.petCharge, data.tollCharge, data.hillsCharge, data.bettaCharge,
    data.stateCharge, data.totalEnteredCharges, data.finalBill,
    new Date(data.createdAt) // Or use: new Date()
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting bill:', err);
      return res.status(500).json({ message: 'Database insert error' });
    }
    res.status(200).json({ message: 'Bill saved successfully', billId: result.insertId });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
