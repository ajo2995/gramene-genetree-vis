var React = require('react');
var ReactDOM = require('react-dom');
var TreeVis = require('./src/components/TreeVis.jsx');

var geneFixture = require('./fixtures/gene.json');

var GrameneTrees = require('gramene-trees-client');

var exampleGenetree = GrameneTrees.genetree.tree(require('./fixtures/genetree.json'));
var taxonomy = GrameneTrees.taxonomy.tree(require('./fixtures/taxonomy.json'));

ReactDOM.render(
  <TreeVis genetree={exampleGenetree}
           geneOfInterest={geneFixture}
           taxonomy={taxonomy}
           width={480}
           height={800}/>,
  document.getElementById('tree')
);