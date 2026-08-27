async function testRegister() {
  try {
    const payload = {
      teamName: 'CyberKnights',
      leaderName: 'Ashish Sharma',
      leaderEmail: 'ashish@example.com',
      leaderPhone: '+919876543210',
      members: [
        { id: 1, name: 'Rohit Verma', email: 'rohit@example.com' },
        { id: 2, name: 'Sneha Patel', email: 'sneha@example.com' }
      ]
    };

    const response = await fetch('https://ideajam2026-backend.vercel.app/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Test error:', err);
  }
}

testRegister();
