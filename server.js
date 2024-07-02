import bodyParser from 'body-parser';
import 'dotenv/config';
import express from 'express';
import path from 'path';

global.__dirname = path.resolve();

const port = process.env.PORT || 1337;
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());

// Start server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
