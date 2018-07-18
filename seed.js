const key = require('./service-account.json');
const pixpedia = require('./src/scrapers/pixpedia.js');
const nicopedia = require('./src/scrapers/nicopedia.js');
const fs = require('fs');
const Firestore = require('@google-cloud/firestore');
const {promisify, inspect} = require('util');
const {uniq} = require('lodash');
const parse = require('csv-parse');

(async () => {
	const charactersCsv = await promisify(fs.readFile)('characters.csv');
	const characterSeed = await promisify(parse)(charactersCsv);

	const couplingsCsv = await promisify(fs.readFile)('couplings.csv');
	const couplingSeed = await promisify(parse)(couplingsCsv);

	const db = new Firestore({
		projectId: 'coupling-moe',
		keyFilename: 'service-account.json',
	});

	const charactersRef = await db.collection('characters');
	const couplingsRef = await db.collection('couplings');
	const categoryRef = (await db.collection('categories').where('name', '==', 'アイドルマスターシンデレラガールズ').get()).docs[0].ref;

	if (process.argv.includes('characters')) {
		for (const [name, ruby, alternative] of characterSeed) {
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
				await new Promise((resolve) => setTimeout(resolve, 3000));

				const [pixpediaData, nicopediaData] = await Promise.all([
					pixpedia(alternative),
					nicopedia(alternative),
				]);

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
	}

	if (process.argv.includes('couplings')) {
		for (const [namesString, character1, character2] of couplingSeed) {
			const names = namesString.split(',');
			const character1Ref = (await db.collection('characters').where('name', '==', character1).get()).docs[0].ref;
			const character2Ref = (await db.collection('characters').where('name', '==', character2).get()).docs[0].ref;

			const result = await couplingsRef
				.where(`members.${character1Ref.id}`, '==', true)
				.where(`members.${character2Ref.id}`, '==', true)
				.get();

			const baseData = {
				character1: character1Ref,
				character2: character2Ref,
				members: {
					[character1Ref.id]: true,
					[character2Ref.id]: true,
				},
				names,
				namesSet: Object.assign({}, ...names.map((name) => ({[name]: true}))),
			};

			if (result.empty) {
				await new Promise((resolve) => setTimeout(resolve, 3000));

				const [pixpediaData, nicopediaData] = await Promise.all([
					pixpedia(names[0]),
					nicopedia(names[0]),
				]);

				const data = {
					...baseData,
					imageUrls: [pixpediaData.imageUrl],
					nicopediaName: names[0],
					pixpediaName: names[0],
					nicopediaDescription: nicopediaData.description,
					pixpediaDescription: pixpediaData.description,
				};

				await couplingsRef.add(data);

				console.log(`Added ${names}: ${inspect(data)}`);
			} else {
				const data = {
					...baseData,
					names: uniq([...result.docs[0].get('names'), ...baseData.names]),
					namesSet: {...result.docs[0].get('namesSet'), ...baseData.namesSet},
				};

				await result.docs[0].ref.update(data);

				console.log(`Updated ${names}: ${inspect(data)}`);
			}
		}
	}

	process.exit();
})();
