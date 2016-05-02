'use strict';

var React = require('react');

function remap(seqPos, blocks) {
  var posInSeq = 0;
  for(var b=0;b<blocks.length;b++) {
    var block = blocks[b];
    var blockLength = block.end - block.start + 1;
    if (seqPos <= posInSeq + blockLength) {
      return block.start + (seqPos - posInSeq);
    }
    posInSeq += blockLength;
  }
  return 0;
}

var ExonJunctions = React.createClass({
  props: {
    id: React.PropTypes.number.isRequired,
    node: React.PropTypes.object.isRequired,
    width: React.PropTypes.number.isRequired,
    alignment: React.PropTypes.object.isRequired
  },
    
  render: function () {
    var node = this.props.node;
    var alignment = this.props.alignment;
    
    var sf = this.props.width / alignment.size;
    var k=0;
    var bins = node.model.exon_junctions.map(function(ej) {
      var ejPos = remap(ej, alignment.blocks);
      var top = (ejPos-1)*sf;
      var bl = top-2.0;
      var br = top+2.0;
      var d = 'M'+top+',0 '+bl+',+3 '+br+',+3 '+top+',0';
      var style = {fill: "darkred", stroke: false};
      k++;
      return (
        <rect key={k} width="1" height="18" x={top} style={style} />
      )      
    });
    
    return (
      <g className="exonJunctions" >
        {bins}
      </g>
    );
  }
});

module.exports = ExonJunctions;