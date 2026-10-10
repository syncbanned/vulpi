const assert = require('assert');
const { isAllowed } = require('./allow');

assert(isAllowed('https://music.youtube.com/library'));
assert(isAllowed('https://accounts.google.com/signin'));
assert(isAllowed('https://accounts.google.com.br/x'));
assert(isAllowed('https://www.google.com.br/'));
assert(!isAllowed('http://music.youtube.com/'));          // sem https
assert(!isAllowed('https://music.youtube.com.evil.com/'));
assert(!isAllowed('https://evil.com/?u=music.youtube.com'));
assert(!isAllowed('https://maps.google.com/'));
assert(!isAllowed('nada'));
console.log('allow.test ok');
