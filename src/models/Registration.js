import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Member name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Member email is required'],
    trim: true,
    lowercase: true,
  },
}, { _id: false });

const registrationSchema = new mongoose.Schema({
  registrationId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  teamName: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
  },
  leader: {
    name: {
      type: String,
      required: [true, 'Team leader name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Team leader email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Team leader phone number is required'],
      trim: true,
    },
  },
  members: {
    type: [memberSchema],
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length >= 1 && v.length <= 5;
      },
      message: 'Team must have between 1 and 5 members (excluding leader)',
    },
  },
  driveLink: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'CONFIRMED', 'PENDING', 'CANCELLED'],
    default: 'Pending',
    index: true,
  },
  remark: {
    type: String,
    default: '',
  },
  score: {
    type: Number,
    default: null,
  },
  round2Status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected'],
    default: 'Pending',
    index: true,
  },
  round2Remark: {
    type: String,
    default: '',
  },
  round2Marks: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  round2Score: {
    type: Number,
    default: null,
  },
  round3Marks: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  round3Score: {
    type: Number,
    default: null,
  },
  emailNotification: {
    leaderDelivered: {
      type: Boolean,
      default: false,
    },
    membersDeliveredCount: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
  },
}, {
  timestamps: true,
});

// Compound/Collated index for case-insensitive unique team name checking
registrationSchema.index({ teamName: 1 }, { collation: { locale: 'en', strength: 2 }, unique: true });

const Registration = mongoose.model('Registration', registrationSchema);

export default Registration;

