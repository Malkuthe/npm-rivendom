const slugify = require('slugify');
const {ALIGNMENTS} = require('./constants');

exports.processCreature = (data) => {

	// Process basic information about the creature
	let creature = {
		source: 'rivendom',
		name: data.name,
		size: data.size.charAt(0).toUpperCase(),
		ac: [], 
		alignment: [],
		speed: {},
		str: data.abilities.str,
		dex: data.abilities.dex,
		con: data.abilities.con,
		int: data.abilities.int,
		wis: data.abilities.wis,
		cha: data.abilities.cha,
	}

	// Process type with consideration for swarms
	if (data.size.includes('swarm')) {
		creature.type = {
			type: data.type,
			swarmSize: data.swarmSize
		}
	} else {
		creature.type = data.type;
	}

	creature.alignment = _processAlignment(data.alignment, false);

	// Process creature's hp
	if (data.hp != null) {
		let hp = data.hp.match(/(\d+)\s*\((\d+d\d+)\s*\+\s*(\d+)\)/);
		creature.hp = {
			average: hp[1],
			formula: `${hp[2]}${hp[4]||''}`
		}
	}

	// Process creature's ac and armor
	if (data.armor != null) {
		creature.ac.push({
			ac: data.ac,
			from: data.armor.split(',')
		})
	} else {
		creature.ac.push(data.ac)
	}

	creature.cr = _processCR(data.cr);

	if (data.languages != null) {
		creature.languages = data.languages.split(',');
	}
	
	// Process creature's senses
	creature.senses = data.senses.split(',').map((item) => {return item.trim();});
	creature.passive = creature.senses.pop().match(/\d+/).shift();

	// Process creature's speed
	const speed = data.speed.split(',');
	creature.speed.walk = parseInt(speed.shift().replace(/ +ft./g,''));

	for (const s of speed) {
		let sParts = s.replace(/ +ft./, '').trim().split(/ +/);

		if (sParts[0] = 'fly') {
			let condition = s.match(/\(\w+\)/g);
			if (condition != null) {
				condition = condition.shift();

				creature.speed.fly = {
					number: parseInt(sParts[1]),
					condition: condition
				}

				if (condition == '(hover)') {
					creature.speed.canHover = true;
				} else {
					creature.speed.fly = parseInt(sParts[1]);
				}
			} else {
				creature.speed[sParts[0]] = parseInt(sParts[1]);
			}
		}
	}

	// Process creature's damage vulnerabilities, resistances, and immunities
	if (data.damage != null) {
		
		if (data.damage.vulnerabilities != null) {
			creature.vulnerable = [..._processDamageTypes(data.damage.vulnerabilities, "vulnerable")];
		}

		if (data.damage.resistances != null) {
			creature.resist = [..._processDamageTypes(data.damage.resistances,"resist")];
		}

		if (data.damage.immunities != null) {
			creature.immune = [..._processDamageTypes(data.damage.immunities,"immune")];
		}
	}

	if (data.condition != null && data.condition.immunities != null) {
		creature.conditionImmune = data.condition.immunities.split(',').map(item => {
			return item.trim();
		});
	}

	if (data.saves != null) {
		creature.save = {};

		for (const [abil, val] of Object.entries(data.saves)) {
			creature.save[abil.toLowerCase()] = `${val < 0 ? '' : '+' }${val}`;
		}
	}

	if (data.skills != null) {
		creature.skill = {};

		for (const [skill,val] of Object.entries(data.saves)) {
			creature.skill[skill.toLowerCase()] = `${val < 0 ? '' : '+'}${val}`
		}
	}

	return creature;
	
}

function _processAlignment(data,isMultiple) {
	let result;

	if(/ or /.test(data)) {

		result = [];
		let parts = data.split(/ or /);
		for (const part of parts) {
			result.push(_processAlignment(part, true));
		}

	} else {

		const alignment = data.replace(/\(.*\)/,'').trim().toLowerCase();
		const tag = (alignment.match(/(any \w+-?\w*) alignment/) || [])[1] || '';
		const chance = (data.match(/\((\d+)%\)/) || [])[1];
		const note = (data.replace(/\(\d+%\)/,'').match(/\(([^.!?]*[.!?"']?)\)/) || [])[1];

		result = ALIGNMENTS[tag.toLowerCase()] || ALIGNMENTS[alignment]; 

		if(isMultiple) {
			result = {
				alignment: result,
				...chance && {chance: chance},
				...note && {note: note}
			}
		}

	}
	
	return result;
}

function _processCR(data) {
	let result;
	
	if (typeof data === 'number') {
		result = data.toString();
	} else if (typeof data === 'object') {
		result = {};
		for (const type in data) {
			result[type] = _processCR(data[type]);
		}
	} else {
		result = data;
	}

	return result;
}

function _processDamageTypes(data,category) {
    let res = data.split(';').map(item => {
        return item.trim();
    });


    if (res.length > 1) { // If there's more than one group of damage types

		// Recursively process each damage type group
        for (let i = 0; i < res.length; i++) {

            res[i] = _processDamageTypes(res[i],category);

            if (Array.isArray(res[i]) && res[i].length == 1 && typeof res[i][0] === 'object') {

				// A type group that has notes is 
				// returned as an object in an array
				// Need to extract that object here
                res[i] = res[i][0];

            } else {
				
				// A type group that just has a list of 
				// types returns a basic array
				// Need to wrap it in its own object
                res[i] = {
                    [category]: [
                        ...res[i]
                    ]
                }

            }
        }

    } else { // Process a single type group
        if (res[0].split(',').length > 1) {

            for (const entry of res[0].split(',')) {
                res = [
                    ...res,
                    ..._processDamageTypes(entry,category)
                ]
            }

			// Extract the pre-note from the first type
			// entry
            res.shift();
            const first = res.shift();
            const firstMatch = first.match(/(\s*[^.!?]*[.!?:]?) (\w+)/);
            let damage = (firstMatch||[])[2] || first;
            const preNote = (firstMatch||[])[1];
            res.unshift(damage);
			
			// Extract the note from the last type entry
            const last = res.pop();
            const lastMatch = last.match(/and (\w+)( damage)?\s*([^.!?]*[.!?]?)/);
            damage = (lastMatch||[])[1] || last;
            const note = (lastMatch||[])[3];
			res.push(damage);

			// Since the type group needs to be an object
			// if it has a note or pre-note, we do that
			// here
            if(note != null || preNote != null) {
                res = {
                    [category]: [
                        ...res
                    ],
                    ...(note != null && note != '') && {note: note},
                    ...(preNote != null && preNote != '') && {preNote: preNote}
                }
            }

        } else if (/(\w+) and (\w+)( damage)?\s*([^.!?]*[.!?]?)/.test(res[0])) {
			// Handles the case where the provided type
			// group only has two types in the 'x and y'
			// form

            let entry = res.pop().match(/(\w+) and (\w+)( damage)?\s*([^.!?]*[.!?]?)/);
            res = [
                entry[1],
                entry[2]
            ]
            if (entry[4] != null) {
                res = {
                    [category]: [
                        ...res
                    ],
                    ...entry[4] != '' && {note: entry[4]}
                }
            }

        } else if (/^\w+ damage$/.test(res[0])) {
            res[0] = res[0].replace('damage','').trim();
        }
    }

    return Array.isArray(res) ? res : [res];
}