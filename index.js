const key = require('./service-account.json');
const firebase = require('firebase-admin');

(async () => {
	firebase.initializeApp({
		credential: firebase.credential.cert(key),
		databaseURL: 'https://coupling-moe.firebaseio.com',
	});

	const db = firebase.database();
	const messaging = firebase.messaging();

	const users = await db.ref('/users').once('value');

	for (const [uid, user] of Object.entries(users.val())) {
		if (!user.notificationToken) {
			continue;
		}

		try {
			await messaging.send({
				token: user.notificationToken,
				webpush: {
					notification: {
						body: 'こんにちは',
						title: '通知テスト2',
						click_action: 'https://coupling.moe',
					},
				},
			});

			console.log(`Sent notification to ${uid}.`);
		} catch (e) {
			console.log(`Notification failed for ${uid}. (error: ${e.message})`);
		}
	}

	await db.goOffline();
	process.exit();
})();
