

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const db = require('./config/db');

app.use(cors());
app.use(bodyParser.json());

// Helper function for error handling
const handleDbError = (res, err, context = 'Database operation') => {
  console.error(`${context} error:`, err);
  res.status(500).json({ message: `${context} failed` });
};

// Driver Registration
app.post('/api/drivers/register', (req, res) => {
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
    drivingLicenseExpiryDate
  } = req.body;

  if (!name || !email || !phoneNumber || !password) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      return handleDbError(res, err, 'Password hashing');
    }

    db.query(
      `INSERT INTO drivers 
      (name, email, phone, password, rc_number, fc_expiry, insurance_number, insurance_expiry, driving_license, dl_expiry) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ],
      (err, result) => {
        if (err) {
          return handleDbError(res, err, 'Driver registration');
        }
        res.status(201).json({ message: 'Driver registered successfully', driverId: result.insertId });
      }
    );
  });
});

// Check if driver exists
app.post('/api/drivers/check-exists', (req, res) => {
  const { email, phoneNumber, rcNumber, insuranceNumber } = req.body;

  db.query(
    `SELECT email, phone, rc_number, insurance_number FROM drivers 
    WHERE email = ? OR phone = ? OR rc_number = ? OR insurance_number = ?`,
    [email, phoneNumber, rcNumber, insuranceNumber],
    (err, rows) => {
      if (err) {
        return handleDbError(res, err, 'Checking driver existence');
      }

      const exists = {
        email: rows.some(r => r.email === email),
        phoneNumber: rows.some(r => r.phone === phoneNumber),
        rcNumber: rows.some(r => r.rc_number === rcNumber),
        insuranceNumber: rows.some(r => r.insurance_number === insuranceNumber),
      };

      res.json(exists);
    }
  );
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM drivers WHERE email = ?', [email], async (err, rows) => {
    if (err) {
      return handleDbError(res, err, 'Login');
    }

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const driver = rows[0];
    const isMatch = await bcrypt.compare(password, driver.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: driver.id, email: driver.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({ token, user: driver });
  });
});

// Get driver by UID
app.get('/api/drivers/get/:uid', (req, res) => {
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ message: 'UID is required' });
  }

  db.query('SELECT * FROM drivers WHERE id = ?', [uid], (err, results) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json(results[0]);
  });
});

// Get driver status by email
app.get('/api/drivers/status/:email', (req, res) => {
  const { email } = req.params;

  db.query('SELECT status FROM drivers WHERE email = ?', [email], (err, rows) => {
    if (err) {
      return handleDbError(res, err, 'Fetching driver status');
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json({ status: rows[0].status });
  });
});

// Get trip status by email
app.get('/api/trips/status/:email', (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  db.query(
    `SELECT * FROM trips WHERE driverEmail = ? AND (status = 'accept' OR status = 'WIP')`,
    [email],
    (err, trips) => {
      if (err) {
        return handleDbError(res, err, 'Fetching trips');
      }

      const acceptedTrips = trips.filter(trip => trip.status === 'accept');
      const wipTrips = trips.filter(trip => trip.status === 'WIP');

      res.json({ acceptedTrips, wipTrips });
    }
  );
});

// Get driver by ID
app.get('/api/drivers/:id', (req, res) => {
  const { id } = req.params;
  
  db.query('SELECT * FROM drivers WHERE id = ?', [id], (err, results) => {
    if (err) {
      return handleDbError(res, err, 'Fetching driver');
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json(results[0]);
  });
});

// Update driver
app.put('/api/drivers/:id', (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  db.query('UPDATE drivers SET ? WHERE id = ?', [updatedData, id], (err) => {
    if (err) {
      return handleDbError(res, err, 'Updating driver');
    }
    res.json({ message: 'Driver updated successfully' });
  });
});

// Get all trips
app.get('/api/trips', (req, res) => {
  db.query('SELECT * FROM trips', (err, rows) => {
    if (err) {
      return handleDbError(res, err, 'Fetching trips');
    }
    res.status(200).json(rows);
  });
});

// Get trip by ID
app.get('/api/trips/:id', (req, res) => {
  const tripId = req.params.id;
  
  db.query('SELECT * FROM trips WHERE id = ?', [tripId], (err, results) => {
    if (err) {
      return handleDbError(res, err, 'Fetching trip');
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    res.status(200).json(results[0]);
  });
});

// Complete trip endpoint
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

  // Validate required fields
  if (!startMeter || !endMeter || !finalBill) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  db.query(
    `UPDATE trips SET 
      startMeter = ?,
      endMeter = ?,
      luggage = ?,
      pet = ?,
      toll = ?,
      hills = ?,
      totalKm = ?,
      finalKm = ?,
      finalBill = ?,
      status = 'completed',
      created_at = NOW()
    WHERE id = ?`,
    [
      startMeter,
      endMeter,
      luggage || 0,
      pet || 0,
      toll || 0,
      hills || 0,
      totalKm || 0,
      finalKm || 0,
      finalBill,
      tripId
    ],
    (err) => {
      if (err) {
        return handleDbError(res, err, 'Completing trip');
      }

      res.json({
        message: 'Trip marked as completed successfully',
        tripId,
        finalBill
      });
    }
  );
});

// Create bill endpoint
app.post('/api/bills', (req, res) => {
  const data = req.body;

  // Validate required fields
  if (!data.driverEmail || !data.customerName || !data.finalBill) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  db.query(
    `INSERT INTO bills (
      driverEmail, customerName, phone,
      pickupLocation, dropLocation,
      pickupDate, pickupTime, tripType,
      startMeter, endMeter, totalKm, finalKm, kmPrice, totalKmPrice,
      luggageCharge, petCharge, tollCharge, hillsCharge, bettaCharge,
      stateCharge, totalEnteredCharges, finalBill, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.driverEmail,
      data.customerName,
      data.phone || null,
      data.pickupLocation || null,
      data.dropLocation || null,
      data.pickupDate || null,
      data.pickupTime || null,
      data.tripType || null,
      data.startMeter || 0,
      data.endMeter || 0,
      data.totalKm || 0,
      data.finalKm || 0,
      data.kmPrice || 0,
      data.totalKmPrice || 0,
      data.luggageCharge || 0,
      data.petCharge || 0,
      data.tollCharge || 0,
      data.hillsCharge || 0,
      data.bettaCharge || 0,
      data.stateCharge || 0,
      data.totalEnteredCharges || 0,
      data.finalBill,
      data.createdAt ? new Date(data.createdAt) : new Date()
    ],
    (err, result) => {
      if (err) {
        return handleDbError(res, err, 'Creating bill');
      }

      res.status(201).json({
        message: 'Bill saved successfully',
        billId: result.insertId,
        tripId: data.tripId
      });
    }
  );
});

// Get all bills for a driver
app.get('/api/bills/get/:driverEmail', (req, res) => {
  const { driverEmail } = req.params;

  if (!driverEmail) {
    return res.status(400).json({ message: "driverEmail is required" });
  }

  const sql = `
    SELECT * FROM bills
    WHERE driverEmail = ?
    ORDER BY createdAt DESC
  `;

  db.query(sql, [driverEmail], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    
    res.status(200).json(results);
  });
});

// Accept trip
// app.put('/api/trips/:id/accept', (req, res) => {
//   const tripId = req.params.id;
//   const { driverEmail } = req.body;

//   db.query('SELECT driverEmail FROM trips WHERE id = ?', [tripId], (err, results) => {
//     if (err) {
//       return handleDbError(res, err, 'Accepting trip');
//     }

//     let currentDrivers = results[0]?.driverEmail || '';
//     let updatedDrivers = currentDrivers
//       ? currentDrivers.split(',').includes(driverEmail)
//         ? currentDrivers
//         : currentDrivers + ',' + driverEmail
//       : driverEmail;

//     db.query(
//       'UPDATE trips SET driverEmail = ?, status = ? WHERE id = ?',
//       [updatedDrivers, 'accept', tripId],
//       (err) => {
//         if (err) {
//           return handleDbError(res, err, 'Accepting trip');
//         }

//         res.status(200).json({ message: 'Trip accepted successfully' });
//       }
//     );
//   });
// });

app.put('/api/trips/:id/accept', (req, res) => {
  const tripId = req.params.id;
  const { driverEmail } = req.body;

  db.query('SELECT acceptedDrivers FROM trips WHERE id = ?', [tripId], (err, results) => {
    if (err) {
      return handleDbError(res, err, 'Fetching acceptedDrivers');
    }

    let currentAccepted = [];

    if (results.length > 0 && results[0].acceptedDrivers) {
      try {
        currentAccepted = JSON.parse(results[0].acceptedDrivers);
      } catch (parseErr) {
        console.error('Error parsing acceptedDrivers JSON:', parseErr);
      }
    }

    // Avoid duplicates
    if (!currentAccepted.includes(driverEmail)) {
      currentAccepted.push(driverEmail);
    }

    const updatedAcceptedDrivers = JSON.stringify(currentAccepted);

    db.query(
      'UPDATE trips SET acceptedDrivers = ?, status = ? WHERE id = ?',
      [updatedAcceptedDrivers, 'accept', tripId],
      (err) => {
        if (err) {
          return handleDbError(res, err, 'Updating acceptedDrivers');
        }

        res.status(200).json({ message: 'Trip accepted successfully' });
      }
    );
  });
});


// Get accepted trips
app.get('/api/trips/accepted/:driverEmail', (req, res) => {
  const { driverEmail } = req.params;

  if (!driverEmail) {
    return res.status(400).json({ message: 'driverEmail is required' });
  }

  db.query(
    'SELECT * FROM trips WHERE status = ? AND driverEmail LIKE ?',
    ['accept', `%${driverEmail}%`],
    (err, results) => {
      if (err) {
        console.error('Fetching accepted trips error:', err);
        return res.status(500).json({ message: 'Fetching accepted trips failed' });
      }

      res.status(200).json(results);
    }
  );
});

// Start trip
app.put('/api/trips/:id/start', (req, res) => {
  const tripId = req.params.id;

  db.query(
    'UPDATE trips SET status = ? WHERE id = ?',
    ['WIP', tripId],
    (err, result) => {
      if (err) {
        return handleDbError(res, err, 'Starting trip');
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Trip not found' });
      }

      res.status(200).json({ message: 'Trip started successfully' });
    }
  );
});

// Get WIP trips
app.get('/api/trips/wip/:driverEmail', (req, res) => {
  const { driverEmail } = req.params;

  db.query(
    'SELECT * FROM trips WHERE status = ? AND driverEmail LIKE ?',
    ['WIP', `%${driverEmail}%`],
    (err, results) => {
      if (err) {
        return handleDbError(res, err, 'Fetching WIP trips');
      }

      res.status(200).json(results);
    }
  );
});

// Update trip field
app.put('/api/trips/update-field', (req, res) => {
  const { tripId, field, value } = req.body;

  if (!tripId || !field) {
    return res.status(400).json({ message: "Missing tripId or field" });
  }

  const allowedFields = ['startMeter', 'endMeter', 'luggage', 'pet', 'toll', 'hills'];
  if (!allowedFields.includes(field)) {
    return res.status(400).json({ message: "Invalid field name" });
  }

  db.query(`UPDATE trips SET ${field} = ? WHERE id = ?`, [value, tripId], (err) => {
    if (err) {
      return handleDbError(res, err, 'Updating trip field');
    }
    res.status(200).json({ message: "Trip updated successfully" });
  });
});

// Get all drivers
app.get('/api/drivers', async (req, res) => {
  db.query('SELECT email, name FROM drivers', (err, rows) => {
    if (err) {
      return handleDbError(res, err, 'Fetching trips');
    }
    res.status(200).json(rows);
  });
});

app.get('/api/all-bills', async (req, res) => {
  db.query('SELECT * FROM bills ORDER BY pickupDate DESC', (err, rows) => {
    if (err) {
      return handleDbError(res, err, 'Fetching trips');
    }
    res.status(200).json(rows);
  });
});

app.get('/api/all-drivers', async (req, res) => {
  db.query('SELECT * FROM drivers', (err, rows) => {
    if (err) {
      return handleDbError(res, err, 'Fetching trips');
    }
    res.status(200).json(rows);
  });
});

app.put('/api/trips/assign-driver', async (req, res) => {
  const { tripId, driverEmail } = req.body;

  if (!tripId || !driverEmail) {
    return res.status(400).json({ message: 'tripId and driverEmail are required' });
  }

  const assignedAt = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL format

  const sql = `
    UPDATE trips
    SET driverEmail = ?, status = 'accept', assignedAt = ?
    WHERE id = ?
  `;

  try {
    db.query(sql, [driverEmail, assignedAt, tripId], (err, result) => {
      if (err) {
        console.error('Error updating trip:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Trip not found' });
      }
      res.status(200).json({ message: 'Driver assigned successfully' });
    });
  } catch (err) {
    console.error('Assignment failed:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


app.post("/api/trips/add-trips", async (req, res) => {
  const trip = req.body;

  try {
    const [result] = await db.query(`
      INSERT INTO trips (
        pickupLocation, dropLocation, tripType, car, pickupDate, pickupTime,
        days, kmPrice, km, betta, phone, state, customerName, customerRemark,
        adult, child, luggage, customerCurrentLocation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      trip.pickupLocation,
      trip.dropLocation,
      trip.tripType,
      trip.car,
      trip.pickupDate,
      trip.pickupTime,
      trip.days || 0,
      trip.kmPrice || 0,
      trip.km || 0,
      trip.betta || 0,
      trip.phone,
      trip.state,
      trip.customerName,
      trip.customerRemark,
      trip.adult || 0,
      trip.child || 0,
      trip.luggage || 0,
      trip.customerCurrentLocation,
      trip.created_at || new Date()
    ]);

    res.status(201).json({ message: "Trip stored successfully", tripId: result.insertId });
  } catch (error) {
    console.error("Error inserting trip:", error);
    res.status(500).json({ message: "Failed to insert trip" });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});