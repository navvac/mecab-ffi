"use strict";
const async = require('async');
const ref = require('ref-napi');
const ffi = require('ffi-napi');

const VoidType = ref.types["void"];
const ModelTypePtr = ref.refType(VoidType);
const TaggerTypePtr = ref.refType(VoidType);
const LatticeTypePtr = ref.refType(VoidType);

const libMecab = ffi.Library('libmecab', {
    'mecab_model_new2': [ModelTypePtr, ['string']],
    'mecab_model_destroy': ['void', [ModelTypePtr]],
    'mecab_model_new_tagger': [TaggerTypePtr, [ModelTypePtr]],
    'mecab_model_new_lattice': [LatticeTypePtr, [ModelTypePtr]],
    'mecab_lattice_set_sentence': ['void', [LatticeTypePtr, 'string']],
    'mecab_parse_lattice': ['void', [TaggerTypePtr, LatticeTypePtr]],
    'mecab_lattice_tostr': ['string', [LatticeTypePtr]],
    'mecab_lattice_clear': ['void', [LatticeTypePtr]],
    'mecab_lattice_destroy': ['void', [LatticeTypePtr]],
    'mecab_strerror': ['string', [TaggerTypePtr]]
});

function parseMeCabOutputString(outputString) {
    var result;
    result = [];
    outputString.split('\n').forEach(function (line) {
        return result.push(line.replace('\t', ',').split(','));
    });
    return result.slice(0, -2);
};

class Mecab {
    constructor(dictionaryPath='/usr/local/lib/mecab/dic/mecab-ko-dic') {
        var errorString, modelPtr, taggerPtr;
        modelPtr = libMecab.mecab_model_new2("-d " + dictionaryPath);
        if (modelPtr.isNull()) {
            errorString = libMecab.mecab_strerror(null);
            throw new Error("Failed to create a new model - " + errorString);
        } else {
            this.modelPtr = modelPtr;
        }
        taggerPtr = libMecab.mecab_model_new_tagger(this.modelPtr);
        if (taggerPtr.isNull()) {
            libMecab.mecab_model_destroy(modelPtr);
            errorString = libMecab.mecab_strerror(taggerPtr);
            throw new Error("Failed to create a new tagger - " + errorString);
        } else {
            this.taggerPtr = taggerPtr;
        }
    }

    parse(inputString, callback) {
        var that = this;

        return async.waterfall([
            function (callback) {
                return libMecab.mecab_model_new_lattice.async(that.modelPtr, function (err, latticePtr) {
                    var errorString;
                    if (latticePtr.isNull()) {
                        errorString = libMecab.mecab_strerror(that.taggerPtr);
                        return callback(new Error("Failed to create a new lattice - " + errorString));
                    }
                    return callback(err, latticePtr);
                });
            }, 
            function (latticePtr, callback) {
                return libMecab.mecab_lattice_set_sentence.async(latticePtr, inputString, function (err) {
                    return callback(err, latticePtr);
                });
            }, 
            function (latticePtr, callback) {
                return libMecab.mecab_parse_lattice.async(that.taggerPtr, latticePtr, function (err) {
                    return callback(err, latticePtr);
                });
            }, 
            function (latticePtr, callback) {
                return libMecab.mecab_lattice_tostr.async(latticePtr, function (err, outputString) {
                    return callback(err, latticePtr, outputString);
                });
            }, 
            function (latticePtr, outputString, callback) {
                return libMecab.mecab_lattice_destroy.async(latticePtr, function (err) {
                    return callback(err, outputString);
                });
            }
        ], function (err, outputString) {
            if (err != null) {
                return callback(err);
            }
            return callback(null, parseMeCabOutputString(outputString));
        });
    }

    parseSync(inputString) {
        var errorString, latticePtr, outputString;
        latticePtr = libMecab.mecab_model_new_lattice(this.modelPtr);
        if (latticePtr.isNull()) {
            errorString = libMecab.mecab_strerror(this.taggerPtr);
            return callback(new Error("Failed to create a new lattice - " + errorString));
        }
        libMecab.mecab_lattice_set_sentence(latticePtr, inputString);
        libMecab.mecab_parse_lattice(this.taggerPtr, latticePtr);
        outputString = libMecab.mecab_lattice_tostr(latticePtr);
        libMecab.mecab_lattice_destroy(latticePtr);
        return parseMeCabOutputString(outputString);
    };

    extractNouns(inputString, callback) {
        var index, morpheme, nouns, prevMorpheme, prevPrevMorpheme, _i, _len;
        parse(inputString, function (err, morphemes) { });
        if (typeof err !== "undefined" && err !== null) {
            return callback(err);
        }
        nouns = [];
        for (index = _i = 0, _len = morphemes.length; _i < _len; index = ++_i) {
            morpheme = morphemes[index];
            if (morpheme[1] === 'NNG' || morpheme[1] === 'NNP' || morpheme[1] === 'NP') {
                if (index > 0) {
                    prevMorpheme = morphemes[index - 1];
                    if (prevMorpheme[1] === 'SN' || (prevMorpheme[1] === 'NNG' || prevMorpheme[1] === 'NNP' || prevMorpheme[1] === 'NP') || prevMorpheme[1] === 'VA+ETM') {
                        nouns.push(prevMorpheme[0] + " " + morpheme[0]);
                    }
                    if (index > 1) {
                        prevPrevMorpheme = morphemes[index - 2];
                        if (prevPrevMorpheme[1] === 'VA' && prevMorpheme[1] === 'ETM') {
                            nouns.push("" + prevPrevMorpheme[0] + prevMorpheme[0] + " " + morpheme[0]);
                        }
                    }
                }
                if (morpheme[1] === 'NNG' || morpheme[1] === 'NNP' || morpheme[1] === 'NP') {
                    nouns.push(morpheme[0]);
                }
            }
        }
        return callback(null, nouns);
    };

    extractKeywords(inputString, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (options == null) {
            options = {};
        }
        if (options.n == null) {
            options.n = 3;
        }
        return parse(inputString, function (err, morphemes) {
            var k, keyword, keywords, morpheme, nouns, tempSN, uniqueKeywordMap, uniqueKeywords, v, _i, _j, _len, _len1;
            if (err != null) {
                return callback(err);
            }
            keywords = [];
            nouns = [];
            tempSN = '';
            for (_i = 0, _len = morphemes.length; _i < _len; _i++) {
                morpheme = morphemes[_i];
                if (morpheme[1] === 'SN') {
                    tempSN = morpheme[0];
                } else if ((morpheme[1] === 'NNG' || morpheme[1] === 'NNP' || morpheme[1] === 'NP') && morpheme[0].length > 1 && morpheme[4] === '*') {
                    nouns.push("" + tempSN + morpheme[0]);
                    tempSN = '';
                } else {
                    if (nouns.length > 1) {
                        keywords.push(nouns.join(' '));
                    }
                    nouns = [];
                    tempSN = '';
                }
            }
            uniqueKeywordMap = {};
            for (_j = 0, _len1 = keywords.length; _j < _len1; _j++) {
                keyword = keywords[_j];
                uniqueKeywordMap[keyword] = keyword;
            }
            uniqueKeywords = [];
            for (k in uniqueKeywordMap) {
                v = uniqueKeywordMap[k];
                uniqueKeywords.push(v);
            }
            uniqueKeywords = uniqueKeywords.slice(0, options.n);
            uniqueKeywords.sort(function (a, b) {
                return b.length - a.length;
            });
            return callback(null, uniqueKeywords);
        });
    };

    extractNounMap(inputString, callback) {
        return extractNouns(inputString, function (err, nouns) {
            var noun, nounMap, _i, _len;
            if (err != null) {
                return callback(err);
            }
            nounMap = {};
            for (_i = 0, _len = nouns.length; _i < _len; _i++) {
                noun = nouns[_i];
                if (nounMap[noun] == null) {
                    nounMap[noun] = 0;
                }
                nounMap[noun]++;
            }
            return callback(null, nounMap);
        });
    };

    extractSortedNounCounts(inputString, callback) {
        return extractNounMap(inputString, function (err, nounMap) {
            var count, noun, nounCounts;
            if (err != null) {
                return callback(err);
            }
            nounCounts = [];
            for (noun in nounMap) {
                count = nounMap[noun];
                nounCounts.push({
                    noun: noun,
                    count: count
                });
            }
            nounCounts.sort(function (a, b) {
                return b.count - a.count;
            });
            return callback(null, nounCounts);
        });
    };

    getDiceCoefficientByNounMap(nounMapA, nounMapB, callback) {
        var countA, countB, noun, score;
        score = 0;
        for (noun in nounMapA) {
            countA = nounMapA[noun];
            countB = 0;
            if (nounMapB[noun] != null) {
                countB = nounMapB[noun];
            }
            score += countA * countB;
        }
        return callback(null, score);
    };

    getDiceCoefficientByString(inputStringA, inputStringB, callback) {
        return async.parallel({
            nounMapA: function (callback) {
                return extractNounMap(inputStringA, callback);
            },
            nounMapB: function (callback) {
                return extractNounMap(inputStringB, callback);
            }
        }, function (err, result) {
            return getDiceCoefficientByNounMap(result.nounMapA, result.nounMapB, callback);
        });
    };
}

module.exports = Mecab;
