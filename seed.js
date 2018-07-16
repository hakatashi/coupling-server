const key = require('./service-account.json');
const pixpedia = require('./src/scrapers/pixpedia.js');
const nicopedia = require('./src/scrapers/nicopedia.js');
const fs = require('fs');
const Firestore = require('@google-cloud/firestore');
const {promisify, inspect} = require('util');
const parse = require('csv-parse');

(async () => {
	const csv = await promisify(fs.readFile)('seed.csv');
	const seed = await promisify(parse)(csv);

	const db = new Firestore({
		projectId: 'coupling-moe',
		keyFilename: 'service-account.json',
	});

	const charactersRef = await db.collection('characters');

	for (const [name, ruby, alternative] of seed) {
		const [pixpediaData, nicopediaData] = await Promise.all([
			pixpedia(alternative),
			nicopedia(alternative),
		]);

		const data = {
			name,
			ruby,
			imageUrl: pixpediaData.imageUrl,
			nicopediaName: alternative,
			nicopediaDescription: nicopediaData.description,
			pixpediaName: alternative,
			pixpediaDescription: pixpediaData.description,
			tweets: [],
		};

		const result = await charactersRef.where('name', '==', name).get();

		if (result.empty) {
			await charactersRef.add(data);
			console.log(`Added ${name}: ${inspect(data)}`);
		} else {
			await result.docs[0].ref.update(data)
			console.log(`Updated ${name}: ${inspect(data)}`);
		}

		await new Promise((resolve) => setTimeout(resolve, 3000));
	}

	process.exit();
})();
