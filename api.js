const express = require('express');

const app = express();

const port = 10000;

app.get('/', (req, res) => {
  res.send('Test completed successfully!');
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});