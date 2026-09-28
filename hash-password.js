const bcrypt = require('bcryptjs');
const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: npm run hash-password -- "a-strong-password-12chars-min"');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 12));
