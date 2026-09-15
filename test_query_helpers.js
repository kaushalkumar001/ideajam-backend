import { connectDB } from './src/config/db.js';
import Registration from './src/models/Registration.js';
import mongoose from 'mongoose';

async function test() {
  await connectDB();
  const sample = await Registration.findOne().lean();
  console.log('Sample _id:', sample._id);

  const testId = sample._id.toString();
  const res1 = await Registration.findById(testId).lean();
  console.log('findById result name:', res1?.name);

  const res2 = await Registration.find({
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(testId) ? new mongoose.Types.ObjectId(testId) : testId },
      { email: 'adhayan.dam@gmail.com' }
    ]
  }).lean();
  console.log('find with $or count:', res2.length, 'name:', res2[0]?.name);

  // Check how many documents have name vs leader.name
  const total = await Registration.countDocuments();
  console.log('Total registrations in DB:', total);

  // Check fields distribution
  const allDocs = await Registration.find().limit(20).lean();
  allDocs.forEach((d, idx) => {
    console.log(`[${idx+1}] ID: ${d._id} | Name: "${d.name}" | Email: "${d.email}" | Leader: ${JSON.stringify(d.leader)} | Members: ${JSON.stringify(d.members)}`);
  });

  process.exit(0);
}

test().catch(console.error);
