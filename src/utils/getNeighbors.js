import Q from "q";
import _ from "lodash";
import {client as searchInterface} from "gramene-search-client";

var facets = {
  roots: {
    type: 'terms',
    field: 'gene_tree_root_taxon_id',
    mincount: 1,
    limit: 100,
    collection: 'taxonomy'
  },
  domains: {
    type: 'terms',
    field: 'domains__ancestors',
    mincount: 1,
    limit: 100
  },
  GO: {
    type: 'terms',
    field: 'GO__ancestors',
    mincount: 1,
    limit: 100
  },
  pathways: {
    type: 'terms',
    field: 'pathways__ancestors',
    mincount: 1,
    limit: 100
  }
};

function search(query) {
  return searchInterface.grameneClient.then((client) =>
    client['Search'].genes(query).then((response) => response.obj)
);
}

function details(collection, idList) {
  return searchInterface.grameneClient.then((client) =>
    client['Data access'][collection]({idList:idList,rows:-1}).then((response) => response.obj)
);
}


function centralGenePromise(queryString) {
  return search({
    q: queryString,
    rows: 10000,
    start: 0,
    fl: ['compara_idx', 'gene_idx', 'id']
  });
}


function allGenesPromise(queryString, numberOfNeighbors) {
  var fieldToQuery = 20;
  if (numberOfNeighbors <= 10) {
    fieldToQuery = 10;
  }
  if (numberOfNeighbors <= 5) {
    fieldToQuery = 5;
  }
  return search({
    q: `{!graph from=compara_neighbors_${fieldToQuery} to=compara_idx_multi maxDepth=1}${queryString}`,
    rows: 100000,
    start: 0,
    fl: ["id", "name", "compara_idx", "gene_idx", "gene_tree", "taxon_id",
      "region", "strand", "biotype", "gene_tree_root_taxon_id", "description", "start", "end",
      "domains__ancestors", "GO__ancestors", "pathways__ancestors"
    ],
    'json.facet': JSON.stringify(facets)
  });
}

function indexGenes(neighborhoodResponse) {
  const genes = {};
  neighborhoodResponse.response.docs.forEach(function (doc) {
    genes[doc.gene_idx] = doc;
  });
  return {genes: genes, facets: neighborhoodResponse.facets};
}

function lookupFacetInfo(neighborhoodResponse) {
  var facetCounts = _.cloneDeep(facets);
  var detailsPromises = [];
  _.forEach(facetCounts, (facetCount, f) => {
    if (neighborhoodResponse.facets.hasOwnProperty(f)) {
      var idList = [];
      facetCount.counts = neighborhoodResponse.facets[f].buckets.map(function(bucket) {
        idList.push(bucket.val);
        return { id: bucket.val, count: bucket.count };
      });
      if (idList.length > 0) {
        var collection = facetCount.hasOwnProperty('collection') ? facetCount.collection : f;
        detailsPromises.push(details(collection, idList).then(function(docs) {
          const details = {};
          docs.forEach(function (doc) {
            details[doc._id] = doc;
          });
          facetCount.counts.forEach(function(bucket) {
            bucket.info = details[bucket.id];
          });
          return 0;
        }));
      }
    }
  });
  // run all the promises
  return Q.all(detailsPromises).then(function() {
    neighborhoodResponse.facets = facetCounts;
    return neighborhoodResponse;
  });
}

function groupGenesIntoNeighborhoods(centralGenes, allGenesAndFacets, numberOfNeighbors, sortedIdsAndIdentities) {
  var allGenes = allGenesAndFacets.genes;
  const neighborhoods = [];
  const geneDocs = _.keyBy(centralGenes.response.docs, 'id');
  sortedIdsAndIdentities.forEach(function (geneIdAndIdentity) {
    const geneId = geneIdAndIdentity.id;
    const doc = geneDocs[geneId];
    if (doc) {
      const geneNeighborhood = {
        center_gene_id: doc.id,
        center_identity: geneIdAndIdentity.identity,
        center_idx: 0, // tbd
        genes: [] // tbd
      };
      const idx = doc.gene_idx;
      let first = idx - numberOfNeighbors;
      let last = idx - numberOfNeighbors;
      // extend first and last to capture numberOfNeighbors compara genes
      const compara_idx = doc.compara_idx;
      const first_compara = compara_idx - numberOfNeighbors;
      const last_compara = compara_idx + numberOfNeighbors;
      while (!!allGenes[first] && allGenes[first].compara_idx > first_compara) first--;
      while (!!allGenes[last] && allGenes[last].compara_idx < last_compara) last++;

      for (let i = first; i <= last; i++) {
        if (!!allGenes[i]
          && allGenes[i].taxon_id === allGenes[idx].taxon_id
          && allGenes[i].region === allGenes[idx].region) {
          if (i === idx) {
            geneNeighborhood.center_idx = geneNeighborhood.genes.length;
          }
          allGenes[i].tree_id = allGenes[i].gene_tree;
          allGenes[i].orientation = allGenes[i].strand === 1 ? '+' : '-';
          geneNeighborhood.genes.push(allGenes[i]);
        }
      }
      neighborhoods.push(geneNeighborhood);
    }
  });
  return {neighborhoods: neighborhoods, facets: allGenesAndFacets.facets};
}

function reverseNeigborhoodsIfGeneOfInterestOnNegativeStrand(neighborhoodsAndFacets) {
  let neighborhoods = neighborhoodsAndFacets.neighborhoods.map( (neighborhood) => {
    const {genes, center_idx} = neighborhood;
    const centerGenes = genes[center_idx];
    centerGenes.identity = neighborhood.center_identity;
    if(centerGenes.orientation === '-') {
      genes.reverse();
      genes.map( (gene) => {
        gene.orientation = gene.orientation === '-' ? '+' : '-';
      });
      neighborhood.center_idx = (genes.length - 1) - neighborhood.center_idx;
      neighborhood.strand = 'forward';
    }
    else {
      neighborhood.strand = 'reverse';
    }
    return neighborhood;
  });
  neighborhoodsAndFacets.neighborhoods = _.keyBy(neighborhoods,'center_gene_id');
  return neighborhoodsAndFacets;
}

function getAndIndexGenes(queryString, numberOfNeighbors) {
  return allGenesPromise(queryString, numberOfNeighbors)
    .then(lookupFacetInfo)
    .then(indexGenes);
}


export function getNeighborhood(genetree, numberOfNeighbors, genomesOfInterest) {
  let queryString = `gene_tree:${genetree.model._id}`;
  if (!_.isEmpty(genomesOfInterest)) {
    let taxa = Object.keys(genomesOfInterest).join(' ');
    queryString = `${queryString} AND taxon_id:(${taxa})`;
  }
  return Q.all([
    centralGenePromise(queryString),
    getAndIndexGenes(queryString, numberOfNeighbors),
    numberOfNeighbors,
    genetree.leafNodes().map((n) => {
      return {
        id: n.model.gene_stable_id,
        identity: n.relationToGeneOfInterest.identity
      }
    })
  ])
    .spread(groupGenesIntoNeighborhoods)
    .then(reverseNeigborhoodsIfGeneOfInterestOnNegativeStrand);
}