const axios = require('axios');

module.exports = async (name) => {
	const url = `http://api.nicodic.jp/page.summary/n/a/${encodeURIComponent(name)}`;
	const result = await axios.get(url);
	const json = result.data.replace(/^\w+\((.+)\)[^)]*$/, '$1');
	const data = JSON.parse(json);

	return {
		title: data.title,
		viewTitle: data.view_title,
		description: data.summary.trim(),
	};
};
