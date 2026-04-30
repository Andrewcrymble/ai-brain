import axios from 'axios';
import { config } from '../config.js';

const client = axios.create({
  baseURL: 'https://beepmate.io',
  timeout: 15_000,
});

/**
 * Send a WhatsApp message via BeepMate.
 *
 * BeepMate's API is GET https://beepmate.io/send?key=<KEY>&id=<TARGET>&msg=<TEXT>.
 * The target id is either a phone number or a Group ID, found in the BeepMate
 * dashboard.
 *
 * @param {string} message
 * @param {string} [to]  — recipient (phone or group id); defaults to env config
 */
export async function sendWhatsApp(message, to = config.BEEPMATE_TARGET_ID) {
  const res = await client.get('/send', {
    params: {
      key: config.BEEPMATE_API_KEY,
      id: to,
      msg: message,
    },
  });
  return res.data;
}
