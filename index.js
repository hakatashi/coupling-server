require('dotenv').config();

const key = require('./service-account.json');
const {google} = require('googleapis');
const axios = require('axios');
const firebase = require('firebase-admin');

(async () => {
	firebase.initializeApp({
		credential: firebase.credential.cert(key),
		databaseURL: 'https://coupling-moe.firebaseio.com',
	});

	const db = firebase.database();

	const token = await new Promise((resolve, reject) => {
		var jwtClient = new google.auth.JWT(
			key.client_email,
			null,
			key.private_key,
			['https://www.googleapis.com/auth/firebase.messaging'],
			null
		);
		jwtClient.authorize(function(err, tokens) {
			if (err) {
				reject(err);
				return;
			}

			resolve(tokens.access_token);
		});
	});

	const users = await db.ref('/users').once('value');

	for (const [uid, user] of Object.entries(users.val())) {
		if (!user.notificationToken) {
			continue;
		}

		const response = await axios.post('https://fcm.googleapis.com/v1/projects/coupling-moe/messages:send', {
			message: {
				token: user.notificationToken,
				notification: {
					body: 'てすとだよ',
					title: '通知テスト',
				},
			},
		}, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		console.log(`Sent notification to ${uid}.`);
	}

	await db.goOffline();
	process.exit();
})();
