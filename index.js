const key = require('./service-account.json');
const firebase = require('firebase-admin');
const Firestore = require('@google-cloud/firestore');

(async () => {
	firebase.initializeApp({
		credential: firebase.credential.cert(key),
		databaseURL: 'https://coupling-moe.firebaseio.com',
	});

	const db = new Firestore({
		projectId: 'coupling-moe',
		keyFilename: 'service-account.json',
	});

	const messaging = firebase.messaging();

	const users = await db.collection('users').get();

	for (const user of users.docs) {
		const data = user.data();

		if (!data.notificationToken) {
			continue;
		}

		try {
			await messaging.send({
				token: data.notificationToken,
				webpush: {
					notification: {
						body: 'こんにちは',
						title: '通知テスト2',
						click_action: 'https://coupling.moe',
					},
				},
			});

			console.log(`Sent notification to ${user.id}.`);
		} catch (e) {
			console.log(`Notification failed for ${user.id}. (error: ${e.message})`);
		}
	}

	process.exit();
})();
