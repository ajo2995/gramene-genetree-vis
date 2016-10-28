'use strict';

var React = require('react');
var ReactDOM = require('react-dom');
var Rcslider = require('rc-slider');
var _ = require('lodash');
var GrameneClient = require('gramene-search-client').client;
var svgPanZoom = require('svg-pan-zoom');
var GeneTree = require('./GeneTree.jsx');
var PositionedAlignment = require('./PositionedAlignment.jsx');
var PositionedDomains = require('./PositionedDomains.jsx');
var PositionedExonJunctions = require('./PositionedExonJunctions.jsx');

var relateGeneToTree = require('../utils/relateGeneToTree');
var nodeCoordinates = require('../utils/nodeCoordinates');
var calculateSvgHeight = require('../utils/calculateSvgHeight');
var domainStats = require('../utils/domainsStats').domainStats;
var alignmentTools = require('../utils/calculateAlignment');
var positionDomains = require('../utils/positionDomains');
import {setDefaultNodeDisplayInfo, makeCladeVisible, makeCladeInvisible, makeNodeVisible, makeNodeInvisible} from "../utils/visibleNodes";
var pruneTree = require('gramene-trees-client').extensions.pruneTree;
var addConsensus = require('gramene-trees-client').extensions.addConsensus;

const DEFAULT_MARGIN = 10;
const DEFAULT_LABEL_WIDTH = 200;
const MAX_TREE_WIDTH = 200;
const MIN_ALIGN_WIDTH = 200;
const windowResizeDebounceMs = 250;

var TreeVis = React.createClass({
  propTypes: {
    // width: React.PropTypes.number.isRequired,
    //height: React.PropTypes.number.isRequired,
    margin: React.PropTypes.number,
    genetree: React.PropTypes.object.isRequired,
    initialGeneOfInterest: React.PropTypes.object,
    genomesOfInterest: React.PropTypes.object,
    taxonomy: React.PropTypes.object,
    allowGeneSelection: React.PropTypes.bool
  },

  getInitialState: function () {
    return {
      hoveredNode: undefined,
      xPos: 0,
      geneOfInterest: this.props.initialGeneOfInterest
    };
  },

  componentWillMount: function () {
    this.genetree = _.cloneDeep(this.props.genetree);

    this.domainStats = domainStats(this.genetree); // do this to all genomes

    this.resizeListener = _.debounce(
        this.updateAvailableWidth,
        windowResizeDebounceMs
    );

    if (!_.isUndefined(global.addEventListener)) {
      global.addEventListener('resize', this.resizeListener);
    }

    if (!_.isEmpty(this.props.genomesOfInterest)) {
      this.genetree = pruneTree(this.props.genetree, this.keepNode());
      this.genetree.geneCount = this.props.genetree.geneCount;
    }

    relateGeneToTree(this.genetree, this.props.initialGeneOfInterest, this.props.taxonomy);
    setDefaultNodeDisplayInfo(this.genetree, this.props.initialGeneOfInterest);
    // this.initializeAlignments(this.props)();
  },

  componentDidMount: function () {
    this.updateAvailableWidth();
  },

  componentWillUnmount: function () {
    if (this.resizeListener) {
      global.removeEventListener('resize', this.resizeListener);
    }
  },

  componentWillReceiveProps: function (nextProps) {
    function haveSameKeys(a, b) {
      return _.size(a) === _.size(b)
          && _.every(b, (val, key) => !!a[key])
    }

    if (!haveSameKeys(nextProps.genomesOfInterest, this.props.genomesOfInterest)) {
      this.genetree = _.cloneDeep(nextProps.genetree);
      if (!_.isEmpty(nextProps.genomesOfInterest)) {
        this.genetree = pruneTree(this.genetree, this.keepNode(nextProps));
        this.genetree.geneCount = nextProps.genetree.geneCount;
      }
      relateGeneToTree(this.genetree, this.props.initialGeneOfInterest, this.props.taxonomy);
      setDefaultNodeDisplayInfo(this.genetree, nextProps.initialGeneOfInterest);
      this.initializeAlignments(nextProps)();
      // this.reinitHeight();
      this.setState({visibleNodes: this.nodeCoordinates()});
    }
  },

  updateAvailableWidth: function () {
    const parentWidth = ReactDOM.findDOMNode(this).parentNode.clientWidth;
    if (this.width !== parentWidth) {
      this.width = parentWidth;
      this.initHeightAndMargin();
      // this.reinitHeight();
      this.setState({visibleNodes: this.nodeCoordinates()});
    }
  },

  keepNode: function (props = this.props) {
    return function _keepNode(node) {
      if (props.genomesOfInterest.hasOwnProperty(node.model.taxon_id)) return true;
      if (node.model.gene_stable_id &&
          _.has(props, 'initialGeneOfInterest.homology.gene_tree.representative.model.id')) {
        if (node.model.gene_stable_id === props.initialGeneOfInterest.homology.gene_tree.representative.model.id) {
          return true;
        }
      }
      return false;
    }
  },

  initializeAlignments: function (props = this.props) {
    return function _initializeAlignments() {
      alignmentTools.clean();
      var multipleAlignment = alignmentTools.calculateAlignment(this.genetree); // not necessarily all genomes
      if (!_.isEmpty(props.genomesOfInterest)) {
        // find gaps in multiple alignment
        var gaps = alignmentTools.findGaps(multipleAlignment);
        // remove gaps from alignments
        alignmentTools.removeGaps(gaps, this.genetree);
      }
      this.domainHist = positionDomains(this.genetree, true);
    }.bind(this);
  },

  // componentWillMount: function () {
  //   this.initHeightAndMargin();
  //   this.initNodes();
  //   this.reinitHeight();
  // },
  initHeightAndMargin: function () {
    this.margin = this.props.margin || DEFAULT_MARGIN;
    this.labelWidth = this.props.labelWidth || DEFAULT_LABEL_WIDTH;
    this.w = this.width - this.labelWidth - (2 * this.margin);

    this.treeWidth = this.w / 2 > MAX_TREE_WIDTH ? MAX_TREE_WIDTH : this.w / 2;
    this.alignmentsWidth = this.w - this.treeWidth;
    this.displayAlignments = true;
    if (this.alignmentsWidth < MIN_ALIGN_WIDTH) {
      this.displayAlignments = false;
      this.treeWidth += this.alignmentsWidth;
      this.consensusHeight = 0;
    }
    else {
      addConsensus(this.genetree);
      this.geneTreeRoot = _.clone(this.genetree);
      delete this.geneTreeRoot.displayInfo;
      this.geneTreeRoot.displayInfo = {
        expanded: false
      };
      this.initializeAlignments(this.props)();
      this.consensusHeight = 36;
    }
    const treeTop = this.margin + this.consensusHeight;
    const consensusTop = this.margin;
    this.transformTree = 'translate(' + this.margin + ', ' + treeTop + ')';
    this.alignmentOrigin = this.margin + this.treeWidth + this.labelWidth;
    this.transformAlignments = 'translate(' + this.alignmentOrigin + ', ' + treeTop + ')';
    this.transformConsensus = 'translate(' + this.alignmentOrigin + ', ' + consensusTop + ')';
  },

  reinitHeight: function () {
    // this.h = calculateSvgHeight(this.genetree); // - (2 * this.margin);
  },

  nodeCoordinates: function () {
    return nodeCoordinates(this.genetree, this.treeWidth);
  },
  // updateNodeCoordinates: function () {
  //   var visibleNodes;
  //
  //   visibleNodes = layoutTree(this.genetree, this.treeWidth);
  //
  //   this.setState({
  //     visibleNodes: visibleNodes
  //   });
  // },
  handleGeneSelect: function (geneNode) {
    if (this.props.allowGeneSelection) {
      GrameneClient.genes(geneNode.model.gene_stable_id).then(function (response) {
        var geneOfInterest = response.docs[0];
        relateGeneToTree(this.genetree, geneOfInterest, this.props.taxonomy);
        setDefaultNodeDisplayInfo(this.genetree, geneOfInterest);
        var visibleNodes = this.nodeCoordinates();
        // this.reinitHeight();
        this.setState({geneOfInterest, visibleNodes});
      }.bind(this));
    }
  },

  changeCladeVisibility: function (node,recursive) {

    if (node.displayInfo.expanded) {
      if (recursive) {
        makeCladeInvisible(node);
      }
      else {
        makeNodeInvisible(node);
      }
    }
    else {
      if (recursive) {
        makeCladeVisible(node);
      }
      else {
        makeNodeVisible(node)
      }
    }

    const newVisibleNodes = nodeCoordinates(
        this.genetree,
        this.treeWidth
    );

    // this.reinitHeight();

    this.setState({
      visibleNodes: newVisibleNodes
    });
  },
  handleNodeUnhover: function (node) {
    if (this.state.hoveredNode === node) {
      this.setState({hoveredNode: undefined});
    }
  },
  handleNodeHover: function (node) {
    this.setState({hoveredNode: node});
  },

  changeParalogVisibility: function (node) {
    if (node.displayInfo.expandedParalogs) {
      // hide these paralogs
      node.displayInfo.paralogs.forEach(function (paralog) {
        var parentNode = paralog.parent;
        while (parentNode != node) {
          parentNode.displayInfo.expandedParalogs = false;
          // check if any child is expanded
          parentNode.displayInfo.expanded = false;
          parentNode.children.forEach((child) => {
            if (child.displayInfo.expanded)
              parentNode.displayInfo.expanded = true;
          });
          parentNode = parentNode.parent
        }
      });
    }
    else {
      node.displayInfo.paralogs.forEach(function (paralog) {
        var parentNode = paralog.parent;
        while (!parentNode.displayInfo.expanded) {
          parentNode.displayInfo.expanded = true;
          parentNode.displayInfo.expandedParalogs = true;
          parentNode = parentNode.parent
        }
      });
    }
    const newVisibleNodes = nodeCoordinates(
      this.genetree,
      this.treeWidth
    );
    // this.reinitHeight();
    this.setState({
      visibleNodes: newVisibleNodes
    });
  },
  
  renderBackground: function () {
    if (this.displayAlignments) {
      var bgStyle = {fill: '#fff', stroke: false};
      var h = calculateSvgHeight(this.genetree) + (2 * this.margin);
      var y = -this.margin;
      var x = -this.margin / 2;
      var w = this.alignmentsWidth + this.margin;
      return (
          <rect key='bg'
                width={w}
                height={h}
                x={x}
                y={y}
                style={bgStyle}/>
      );
    }
  },

  renderConsensus: function () {
    if (this.displayAlignments) {
      var w = this.alignmentsWidth + this.margin;
      var alignment = alignmentTools.calculateAlignment(this.geneTreeRoot);
      var domains = positionDomains(this.geneTreeRoot);
      var consensus = (
        <g>
          <PositionedAlignment node={this.geneTreeRoot} width={this.alignmentsWidth} stats={this.domainStats} domains={domains}
                               highlight={false} alignment={alignment}/>
          <PositionedDomains node={this.geneTreeRoot} width={this.alignmentsWidth} stats={this.domainStats} domains={domains}
                             alignment={alignment}/>
        </g>
      );
      return (
        <g className="consensus-wrapper" transform={this.transformConsensus}>
          <svg width={w}
               height="18">
            {consensus}
          </svg>
        </g>
      );
    }
  },

  scrollConsensus: function (event) {
    this.setState({xMin: event.target.value || 0});
  },

  renderAlignments: function () {
    if (this.displayAlignments) {
      var width = this.alignmentsWidth;
      var alignments = this.state.visibleNodes.map(function (node) {
        if (node.model.gene_stable_id || !node.displayInfo.expanded) {

          if (this.displayMSA) {

            var vb = this.state.xMin + " 0 "+this.alignmentsWidth+" 18";
            var fontStyle={fontFamily:'courier'};
            return (
              <g key={node.model.node_id}>
                <svg width={width} height="18" viewBox={vb}>
                  <text y={8} dy=".35em" style={fontStyle}>{node.model.consensus.sequence.join('')}</text>
                </svg>
              </g>
            )
          }
          else {
            var alignment = alignmentTools.calculateAlignment(node);
            var pej;
            if (node.model.exon_junctions) {
              pej = (
                <PositionedExonJunctions node={node} width={width} alignment={alignment}/>
              )
            }
            var domains = positionDomains(node);
            return (
              <g key={node.model.node_id}>
                {pej}
                <PositionedAlignment node={node} width={width} stats={this.domainStats} domains={domains}
                                     highlight={false} alignment={alignment}/>
                <PositionedDomains node={node} width={width} stats={this.domainStats} domains={domains}
                                   alignment={alignment}/>
              </g>
            )
          }
        }
      }.bind(this));
      return (
        <g className="alignments-wrapper" transform={this.transformAlignments}>
          {this.renderBackground()}
          {alignments}
        </g>
      );
    }
  },

  render: function () {
    var genetree, height;

    if (!this.width) {
      return <div></div>;
    }

    height = calculateSvgHeight(this.genetree) + (2*this.margin + this.consensusHeight);

    if (this.state.visibleNodes) {
      genetree = (
          <GeneTree nodes={this.state.visibleNodes}
                    onGeneSelect={this.handleGeneSelect}
                    onInternalNodeSelect={this.changeCladeVisibility}
                    onInternalNodeSelect2={this.changeParalogVisibility}
                    onNodeHover={this.handleNodeHover}
                    onNodeUnhover={this.handleNodeUnhover}
                    taxonomy={this.props.taxonomy}
                    overlaysContainer={this.refs.overlaysContainer}
          />
      );
    }
    var zoomPosition = {
      left: this.alignmentOrigin,
      width: this.alignmentsWidth
    };

    const CustomHandle = props => {
      const style = { left: `${props.offset}%` };
      return (
        <span className="handle" style={style} />
      );
    };
    CustomHandle.propTypes = {
      value: React.PropTypes.any,
      offset: React.PropTypes.number,
    };
    return (
    <div>
      <div className="zoomer" style={zoomPosition}>
        <Rcslider
          min={0}
          max={this.alignmentsWidth}
          range={true}
          pushable={100}
          defaultValue={[0,this.alignmentsWidth]}
          handle={<CustomHandle />}
        />
      </div>
      <div className="genetree-vis">
        <svg width={this.width} height={height}>
          <g className="tree-wrapper" transform={this.transformTree}>
            {genetree}
          </g>
          {this.renderConsensus()}
          {this.renderAlignments()}
        </svg>
        <div ref="overlaysContainer"
             className="overlays"></div>
        <input type="text" defaultValue="0" onChange={this.scrollConsensus}/>
      </div>
    </div>
    );
  }
});

module.exports = TreeVis;
