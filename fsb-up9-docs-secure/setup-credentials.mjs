import crypto from 'node:crypto';
import readline from 'node:readline/promises';
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const user=await rl.question('Пароль пользователя: '),admin=await rl.question('Пароль администратора: ');rl.close();
if(user.length<16||admin.length<16||user===admin){console.error('Нужны два разных пароля длиной от 16 символов.');process.exit(1)}
const hash=password=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(password,salt,64).toString('hex')};
console.log('\nСохраните только на сервере, вне GitHub:');console.log('USER_PASSWORD_HASH='+hash(user));console.log('ADMIN_PASSWORD_HASH='+hash(admin));console.log('SESSION_SECRET='+crypto.randomBytes(32).toString('base64'));
