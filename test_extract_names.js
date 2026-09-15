import { connectDB } from './src/config/db.js';
import Registration from './src/models/Registration.js';
import { formatParticipantName } from './src/services/certificateService.js';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const extractRecipientsFromTeams = (teamsList) => {
  const recipientMap = new Map();

  const addRecipient = (rawName, rawEmail, teamName) => {
    if (!rawEmail || typeof rawEmail !== 'string') return;
    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return;

    let candidateName = (rawName || '').toString().trim();
    const lower = candidateName.toLowerCase();
    const isPlaceholder = (
      !candidateName ||
      lower === '—' ||
      lower === '-' ||
      lower === 'undefined' ||
      lower === 'null' ||
      lower === 'none' ||
      lower === 'na' ||
      lower === 'n/a' ||
      lower === 'team leader' ||
      lower === 'team member' ||
      lower === 'participant'
    );

    if (isPlaceholder) {
      const prefix = cleanEmail.split('@')[0].replace(/[0-9._-]+/g, ' ').trim();
      candidateName = prefix
        ? prefix.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : 'Participant';
    }

    const formattedName = formatParticipantName(candidateName);

    if (recipientMap.has(cleanEmail)) {
      const existing = recipientMap.get(cleanEmail);
      if (existing.name === 'Participant' && formattedName !== 'Participant') {
        recipientMap.set(cleanEmail, {
          name: formattedName,
          email: cleanEmail,
          teamName: teamName || existing.teamName || 'IdeaJam 2026',
        });
      }
      return;
    }

    recipientMap.set(cleanEmail, {
      name: formattedName,
      email: cleanEmail,
      teamName: teamName || 'IdeaJam 2026',
    });
  };

  for (const team of teamsList) {
    if (!team) continue;
    const teamDisplayName = team.teamName || team.team || (team.name ? `${team.name}'s Team` : 'IdeaJam 2026');

    if (team.email) {
      const directName = team.name || team.fullName || team.participantName || team.studentName || team.userName || team.leaderName;
      addRecipient(directName, team.email, teamDisplayName);
    }

    if (team.leader) {
      if (typeof team.leader === 'object') {
        const leaderName = team.leader.name || team.leader.fullName || team.leader.participantName || team.leaderName || team.name;
        const leaderEmail = team.leader.email || team.leaderEmail || team.email;
        addRecipient(leaderName, leaderEmail, teamDisplayName);
      } else if (typeof team.leader === 'string' && team.leader !== '—') {
        addRecipient(team.leader, team.leaderEmail || team.email, teamDisplayName);
      }
    }

    if (Array.isArray(team.members)) {
      for (const m of team.members) {
        if (!m) continue;
        if (typeof m === 'object') {
          const memberName = m.name || m.fullName || m.memberName || m.participantName || m.studentName;
          const memberEmail = m.email || m.memberEmail || m.userEmail;
          addRecipient(memberName, memberEmail, teamDisplayName);
        } else if (typeof m === 'string') {
          if (isValidEmail(m)) {
            addRecipient('', m, teamDisplayName);
          } else {
            addRecipient(m, '', teamDisplayName);
          }
        }
      }
    }

    for (let i = 1; i <= 10; i++) {
      const mName = team[`member${i}_name`] || team[`member${i}Name`];
      const mEmail = team[`member${i}_email`] || team[`member${i}Email`];
      if (mEmail) {
        addRecipient(mName, mEmail, teamDisplayName);
      }
    }
  }

  return Array.from(recipientMap.values());
};

async function run() {
  await connectDB();
  const docs = await Registration.find().limit(30).lean();
  const recipients = extractRecipientsFromTeams(docs);
  console.log(`Extracted ${recipients.length} recipients from ${docs.length} docs:`);
  recipients.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.name}] -> ${r.email} (${r.teamName})`);
  });
  process.exit(0);
}

run().catch(console.error);
