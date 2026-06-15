const bcrypt = require('bcrypt');

async function test() {
  const hash = '$2b$10$3M.gdiob7z.LbjCitlN4DuM//mv4oNU1x1yGYD51wXFw30qVt8MoO';
  const match1 = await bcrypt.compare('password123', hash);
  const match2 = await bcrypt.compare('"password123"', hash);
  console.log('password123:', match1);
  console.log('"password123":', match2);
}

test();
