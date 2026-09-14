import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Registration from './src/models/Registration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data/registrations.json');

async function migrateData() {
  console.log('🔄 Connecting to MongoDB Atlas...');
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅ Connected to MongoDB Atlas: ${conn.connection.host}, DB: ${conn.connection.name}`);

    if (!fs.existsSync(DATA_FILE)) {
      console.log('⚠️ No local registrations.json file found at:', DATA_FILE);
      process.exit(0);
    }

    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const localRegistrations = JSON.parse(rawData || '[]');

    console.log(`📦 Found ${localRegistrations.length} registration(s) in local JSON file.`);

    if (localRegistrations.length === 0) {
      console.log('No records to migrate.');
      process.exit(0);
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of localRegistrations) {
      const regId = item.registrationId;
      const leaderEmail = item.leader?.email?.toLowerCase();

      // Check if registration already exists in Atlas
      const existing = await Registration.findOne({
        $or: [
          { registrationId: regId },
          { 'leader.email': leaderEmail }
        ]
      });

      const docData = {
        registrationId: item.registrationId,
        teamName: item.teamName,
        leader: {
          name: item.leader?.name,
          email: item.leader?.email?.toLowerCase(),
          phone: item.leader?.phone,
        },
        members: (item.members || []).map((m, idx) => ({
          id: m.id || idx + 1,
          name: m.name,
          email: m.email?.toLowerCase(),
        })),
        driveLink: item.driveLink || '',
        status: item.status || 'Pending',
        remark: item.remark || '',
        score: item.score ?? null,
        round2Status: item.round2Status || 'Pending',
        round2Remark: item.round2Remark || '',
        round2Marks: item.round2Marks || {},
        round2Score: item.round2Score ?? null,
        round3Marks: item.round3Marks || {},
        round3Score: item.round3Score ?? null,
        emailNotification: item.emailNotification || {
          leaderDelivered: false,
          membersDeliveredCount: 0,
          lastSentAt: null,
        },
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
      };

      if (existing) {
        // Update existing record
        await Registration.updateOne({ _id: existing._id }, { $set: docData });
        console.log(`🔁 Updated existing team in Atlas: "${docData.teamName}" (${docData.registrationId})`);
        updatedCount++;
      } else {
        // Create new record
        const newDoc = new Registration(docData);
        await newDoc.save();
        console.log(`➕ Inserted new team into Atlas: "${docData.teamName}" (${docData.registrationId})`);
        insertedCount++;
      }
    }

    console.log('\n==============================');
    console.log('🎉 Migration Completed Successfully!');
    console.log(`Total local records: ${localRegistrations.length}`);
    console.log(`Inserted: ${insertedCount}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);

    // Verify current total in Atlas DB
    const totalAtlasCount = await Registration.countDocuments();
    console.log(`📊 Total Registrations in MongoDB Atlas Database: ${totalAtlasCount}`);
    console.log('==============================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed with error:', error);
    process.exit(1);
  }
}

migrateData();
