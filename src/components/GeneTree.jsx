'use strict';

var React = require('react');
var _ = require('lodash');

var microsoftBrowser = require('../utils/microsoftBrowser');

var Edge = require('./Edge.jsx');
var Node = require('./Node.jsx');

var GeneTree = React.createClass({
  propTypes: {
    nodes: React.PropTypes.array.isRequired,
    onGeneSelect: React.PropTypes.func.isRequired,
    onInternalNodeSelect: React.PropTypes.func.isRequired,
    onNodeHover: React.PropTypes.func.isRequired,
    taxonomy: React.PropTypes.object
  },

  componentWillMount: function () {
    var Clade, geneTreeProps;
    geneTreeProps = this.props;

    //noinspection JSUnusedAssignment
    Clade = this.Clade = React.createClass({
      propTypes: {
        node: React.PropTypes.object.isRequired,
        cladeHovered: React.PropTypes.bool,
        xOffset: React.PropTypes.number.isRequired,
        yOffset: React.PropTypes.number.isRequired
      },

      getInitialState: function () {
        return {};
      },

      componentWillMount: function () {
        //noinspection JSPotentiallyInvalidUsageOfThis
        this.onSelect = this.props.node.model.gene_stable_id ? geneTreeProps.onGeneSelect : geneTreeProps.onInternalNodeSelect;
      },

      componentDidMount: function () {
        this.setState({mounted: true});
      },

      handleClick: function (e) {
        e.stopPropagation();
        //noinspection JSPotentiallyInvalidUsageOfThis
        this.onSelect(this.props.node);

        // it's confusing if a newly expanded clade is hovered.
        // and besides, I haven't worked out how to get the
        // internal node to be the correct size.
        //noinspection JSPotentiallyInvalidUsageOfThis
        if (this.props.node.displayInfo.expanded) {
          this.setState({hovered: false});
        }
      },

      hover: function (e) {
        e.stopPropagation();
        //noinspection JSPotentiallyInvalidUsageOfThis
        geneTreeProps.onNodeHover(this.props.node);
        this.setState({hovered: true});
      },

      unhover: function (e) {
        e.stopPropagation();
        //noinspection JSPotentiallyInvalidUsageOfThis
        geneTreeProps.onNodeUnhover(this.props.node);
        this.setState({hovered: false});
      },

      transform: function (isStyle) {
        var x, y, px;

        px = isStyle ? 'px' : '';

        if (this.state.mounted) {
          //noinspection JSPotentiallyInvalidUsageOfThis
          x = this.props.node.x - this.props.xOffset;
          //noinspection JSPotentiallyInvalidUsageOfThis
          y = this.props.node.y - this.props.yOffset;
        }
        else {
          //noinspection JSPotentiallyInvalidUsageOfThis
          x = this.props.xOffset;
          //noinspection JSPotentiallyInvalidUsageOfThis
          y = this.props.yOffset;
        }

        return 'translate(' + y + px + ', ' + x + px + ')';
      },

      renderSubClades: function () {
        var node, children, cladeHovered;

        //noinspection JSPotentiallyInvalidUsageOfThis
        node = this.props.node;
        children = node.children;
        //noinspection JSPotentiallyInvalidUsageOfThis
        cladeHovered = !!(this.props.cladeHovered || this.state.hovered);

        if (_.isArray(children) && node.displayInfo.expanded) {
          return children.map(function (childNode, idx) {
            return <Clade key={idx}
                          node={childNode}
                          cladeHovered={cladeHovered}
                          xOffset={node.x}
                          yOffset={node.y}/>
          });
        }
      },

      renderNode: function () {
        var node;

        //noinspection JSPotentiallyInvalidUsageOfThis
        node = this.props.node;

        return (
          <Node node={node}
                onSelect={this.onSelect}
                taxonomy={geneTreeProps.taxonomy}/>
        );
      },

      renderEdge: function () {
        var node, parent, cladeHovered;

        //noinspection JSPotentiallyInvalidUsageOfThis
        node = this.props.node;
        parent = node.parent;
        //noinspection JSPotentiallyInvalidUsageOfThis
        cladeHovered = !!(this.props.cladeHovered || this.state.hovered);

        if (parent) {
          //noinspection JSPotentiallyInvalidUsageOfThis
          return (
            <Edge source={node}
                  target={parent}
                  cladeHovered={cladeHovered}
                  thisCladeHovered={!!this.state.hovered}/>
          );
        }
      },

      render: function () {
        var props = {
          className: 'clade',
          onMouseOver: this.hover,
          onMouseOut: this.unhover,
          onClick: this.handleClick
        };

        if(microsoftBrowser) {
          props.transform = this.transform(false);
        }
        else {
          props.style = { transform: this.transform(true) };
        }

        return (
          <g {...props}>
            {this.renderEdge()}
            {this.renderNode()}
            {this.renderSubClades()}
          </g>
        );
        //return (
        //  <g className="clade"
        //     onMouseOver={this.hover}
        //     onMouseOut={this.unhover}
        //     onClick={this.handleClick}
        //     transform={this.transform()}
        //     style={{transform: this.transform()}}>
        //
        //    {this.renderEdge()}
        //    {this.renderNode()}
        //    {this.renderSubClades()}
        //  </g>
        //);
      }
    });
  },

  handleNodeSelect: function (node) {
    if (node.model.gene_stable_id) {
      this.props.onGeneSelect(node);
    }
    else {
      this.props.onInternalNodeSelect(node);
    }
  },

  handleHover: function (node) {
    this.props.onNodeHover(node);
  },

  render: function () {
    var Clade = this.Clade;

    return (
      <g className="genetree">
        <Clade node={this.props.nodes[0]} xOffset={0} yOffset={0}/>
      </g>
    )
  }
});

module.exports = GeneTree;