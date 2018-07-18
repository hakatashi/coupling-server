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
	const categoryRef = (await db.collection('categories').where('name', '==', 'アイドルマスターシンデレラガールズ').get()).docs[0].ref;

	for (const [name, ruby, alternative] of seed) {
		const baseData = {
			name,
			ruby,
			nicopediaName: alternative,
			pixpediaName: alternative,
			tweets: [],
			category: categoryRef,
		};

		const result = await charactersRef.where('name', '==', name).get();

		if (result.empty) {
			const [pixpediaData, nicopediaData] = await Promise.all([
				pixpedia(alternative),
				nicopedia(alternative),
			]);

			await new Promise((resolve) => setTimeout(resolve, 3000));

			const data = {
				...baseData,
				imageUrl: pixpediaData.imageUrl,
				nicopediaDescription: nicopediaData.description,
				pixpediaDescription: pixpediaData.description,
			};

			await charactersRef.add(data);

			console.log(`Added ${name}: ${inspect(data)}`);
		} else {
			await result.docs[0].ref.update(baseData);

			console.log(`Updated ${name}: ${inspect(baseData)}`);
		}
	}

	process.exit();
})();
