require('dotenv').config();

const key = require('./service-account.json');
const {google} = require('googleapis');
const axios = require('axios');

(async () => {
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

	const response = await axios.post('https://fcm.googleapis.com/v1/projects/coupling-moe/messages:send', {
		message: {
			token : process.env.NOTIFICATION_TOKEN,
			notification : {
				body : 'てすとだよ',
				title : '通知テスト',
			},
		},
	}, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	console.log(response);
})();
