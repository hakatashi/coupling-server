require('dotenv').config();

const key = require('./service-account.json');
const pixpedia = require('./src/scrapers/pixpedia.js');
const nicopedia = require('./src/scrapers/nicopedia.js');
const fs = require('fs');
const Firestore = require('@google-cloud/firestore');
const {google} = require('googleapis');
const {promisify, inspect} = require('util');
const {uniq} = require('lodash');
const parse = require('csv-parse');

const customsearch = google.customsearch('v1');

(async () => {
	const charactersCsv = await promisify(fs.readFile)('characters.csv');
	const characterSeed = await promisify(parse)(charactersCsv);

	const couplingsCsv = await promisify(fs.readFile)('couplings.csv');
	const couplingSeed = await promisify(parse)(couplingsCsv);

	const db = new Firestore({
		projectId: 'coupling-moe',
		keyFilename: 'service-account.json',
	});

	const googleClient = await google.auth.getClient({
		scopes: [
			'https://www.googleapis.com/auth/cloud-platform',
			'https://www.googleapis.com/auth/cse',
		],
		projectId: 'coupling-moe',
		keyFilename: 'service-account.json',
	});

	const charactersRef = await db.collection('characters');
	const couplingsRef = await db.collection('couplings');
	const imagesRef = await db.collection('images');
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
				color: '#212121',
				gender: 'unknown',
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
				images: [],
				imagesUpdatedAt: null,
				isReversible: true,
				isGeneral: false,
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

	if (process.argv.includes('coupling-image')) {
		const couplingRef = await db.collection('couplings').doc('m1hos0FlfjFNz0vPTfnX');
		const coupling = await couplingRef.get();

		const searchResult = await customsearch.cse.list({
			q: coupling.get('names').map((name) => `"${name}"`).join(' OR '),
			cx: process.env.CUSTOMSEARCH_ENGINE_ID,
			lr: 'lang_ja',
			num: 10,
			searchType: 'image',
			auth: googleClient,
		});

		const images = [];

		for (const item of searchResult.data.items) {
			const result = await imagesRef.where('link', '==', item.link).get();

			if (result.empty) {
				const imageRef = await imagesRef.add(item);
				images.push(imageRef);
				console.log(`Added ${item.link}: ${inspect(item)}`);
			} else {
				await result.docs[0].ref.update(item);
				images.push(result.docs[0].ref);
				console.log(`Updated ${item.link}: ${inspect(item)}`);
			}
		}

		await couplingRef.update({
			images,
			imagesUpdatedAt: new Date(),
		});
	}

	process.exit();
})();
