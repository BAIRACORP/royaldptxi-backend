const db = require('../config/db');

exports.registerDriver = async (req, res) => {
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
    aadharNumber
  } = req.body;

  if (!name || !email || !phoneNumber || !password) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  try {
    const [result] = await db.query(`
      INSERT INTO drivers 
      (name, email, phoneNumber, password, rcNumber, fcDate, insuranceNumber, insuranceExpiryDate, drivingLicense, drivingLicenseExpiryDate, aadharNumber) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
        aadharNumber
      ]);

    res.status(201).json({ message: 'Driver registered successfully', driverId: result.insertId });

  } catch (err) {
    console.error('Error inserting driver:', err);
    res.status(500).json({ message: 'Database insert failed' });
  }
};

exports.checkexists = async (req, res) => {
  const { email, phoneNumber, rcNumber, insuranceNumber } = req.body;

  try {
    const [rows] = await db.query(`
      SELECT email, phoneNumber, rcNumber, insuranceNumber FROM drivers 
      WHERE email = ? OR phoneNumber = ? OR rcNumber = ? OR insuranceNumber = ?`, 
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
};
