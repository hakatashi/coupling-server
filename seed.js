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

	const charactersRef = db.collection('characters');
	const couplingsRef = db.collection('couplings');
	const imagesRef = db.collection('images');
	const categoryRef = db.collection('categories').doc('imas346');

	if (process.argv.includes('characters')) {
		await db.collection('categories').doc('imas346').set({
			name: 'アイドルマスターシンデレラガールズ',
			shortName: 'デレマス',
			slug: 'imas346',
		});
		await db.collection('categories').doc('imas765').set({
			name: 'アイドルマスター',
			shortName: 'アイマス',
			slug: 'imas765',
		});
		await db.collection('categories').doc('imas876').set({
			name: 'アイドルマスターディアリースターズ',
			shortName: 'アイマスDS',
			slug: 'imas876',
		});
		await db.collection('categories').doc('imas315').set({
			name: 'アイドルマスターSideM',
			shortName: 'SideM',
			slug: 'imas315',
		});
		await db.collection('categories').doc('imas283').set({
			name: 'アイドルマスターシャイニーカラーズ',
			shortName: 'シャニマス',
			slug: 'imas283',
		});
		await db.runTransaction(async (transaction) => {
			const characters = await transaction.get(charactersRef);
			for (const [name, ruby, alternative, category] of characterSeed) {
				const baseData = {
					name,
					ruby,
					nicopediaName: alternative,
					pixpediaName: alternative,
					tweets: [],
					category: db.collection('categories').doc(category),
					gender: 'unknown',
				};

				const character = characters.docs.find((c) => c.get('name') === name);

				if (character === undefined) {
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
						color: '#212121',
					};

					const newCharacterRef = charactersRef.doc();
					await transaction.set(newCharacterRef, data);

					console.log(`Added ${name}: ${inspect(data)}`);
				} else {
					await transaction.update(character.ref, baseData);

					console.log(`Updated ${name}: ${inspect(baseData)}`);
				}
			}
		});
	}

	if (process.argv.includes('migrate-couplings')) {
		await db.runTransaction(async (transaction) => {
			const couplings = await transaction.get(couplingsRef);
			for (const coupling of couplings.docs.slice(0, 500)) {
				const membersSize = new Set(Object.keys(coupling.get('members'))).size;
				await transaction.update(coupling.ref, {membersSize});
			}
		});
	}

	if (process.argv.includes('couplings')) {
		await db.runTransaction(async (transaction) => {
			const characters = await transaction.get(charactersRef);
			console.log(couplingSeed);
			for (const [namesString, character1, character2] of couplingSeed) {
				const names = namesString.split(',');
				const membersSize = new Set([character1, character2]).size;
				console.log(character1);
				const character1Ref = characters.docs.find((c) => c.get('name') === character1).ref;
				console.log(character2);
				const character2Ref = characters.docs.find((c) => c.get('name') === character2).ref;

				const coupling = await transaction.get(
					couplingsRef
					.where(`members.${character1Ref.id}`, '==', true)
					.where(`members.${character2Ref.id}`, '==', true)
					.where('membersSize', '==', membersSize)
				).docs[0];

				const baseData = {
					character1: character1Ref,
					character2: character2Ref,
					members: {
						[character1Ref.id]: true,
						[character2Ref.id]: true,
					},
					membersSize,
					names,
					namesSet: Object.assign({}, ...names.map((name) => ({[name]: true}))),
					isReversible: true,
					isGeneral: false,
				};

				if (coupling === undefined) {
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
						images: [],
						imagesUpdatedAt: null,
					};

					const newCouplingRef = couplingsRef.doc();
					await transaction.set(newCouplingRef, data);

					console.log(`Added ${names}: ${inspect(data)}`);
				} else {
					const data = {
						...baseData,
						names: uniq([...coupling.get('names'), ...baseData.names]),
						namesSet: {...coupling.get('namesSet'), ...baseData.namesSet},
					};

					await transaction.update(coupling.ref, data);

					console.log(`Updated ${names}: ${inspect(data)}`);
				}
			}
		});
	}

	if (process.argv.includes('coupling-image')) {
		let coupling = null;
		const couplings = await couplingsRef.where('imagesUpdatedAt', '==', null).limit(1).get();

		if (couplings.size !== 0) {
			coupling = couplings.docs[0];
		} else {
			const fetchedCouplings = await couplingsRef.orderBy('imagesUpdatedAt').limit(1).get();
			if (fetchedCouplings.size !== 0) {
				coupling = fetchedCouplings.docs[0];
			} else {
				return;
			}
		}

		console.log(`Fetching images for ${inspect(coupling.data())}`);

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

		await coupling.ref.update({
			images,
			imagesUpdatedAt: new Date(),
		});
	}

	process.exit();
})();
