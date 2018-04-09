const {CompositeDisposable, Disposable, Emitter, d3} = require('via');
const _ = require('underscore-plus');

const AXIS_HEIGHT = 22;
const FLAG_HEIGHT = AXIS_HEIGHT - 3;

const OPEN = ['open', 'canceling'];
const PENDING = ['pending', 'transmitting', 'received'];
const CLOSED = ['canceled', 'expired'];
const DIRECTIONS = {above: 'rises above', below: 'falls below', cross: 'crosses'};

class ChartAlert {
    constructor({chart, element, panel, layer, params}){
        this.disposables = new CompositeDisposable();
        this.chart = chart;
        this.alert = params;
        this.layer = layer;
        this.panel = panel;
        this.element = element.classed('chart-alert-line', true);

        this.disposables.add(this.alert.onDidUpdate(this.update.bind(this)));
        this.disposables.add(this.alert.onDidUpdateMarket(this.remove.bind(this)));
        this.disposables.add(this.alert.onDidUpdateType(this.remove.bind(this)));
        this.disposables.add(this.alert.onDidDestroy(this.remove.bind(this)));

        this.tools = d3.select(this.panel.center).append('div').classed('chart-alert-tools', true);
        this.base = this.tools.append('div').classed('base', true);
        this.estimate = this.tools.append('div').classed('estimate', true);
        this.cancel = this.tools.append('div').classed('cancel', true);
        this.line = this.element.append('path').attr('transform', `translate(0, 0.5)`);

        this.flag = this.panel.axis.flag();
        this.flag.classed('chart-alert-flag', true);

        this.tools.call(d3.drag().on('drag', this.drag()));
        this.cancel.on('click', this.kill());

        this.disposables.add(new Disposable(() => this.flag.remove()));
        this.disposables.add(new Disposable(() => this.tools.remove()));
        this.disposables.add(this.panel.onDidDestroy(this.destroy.bind(this)));
        this.disposables.add(this.panel.onDidResize(this.update.bind(this)));

        this.disposables.add(via.commands.add(this.tools.node(), 'alerts:cancel-alert', () => {
            this.alert.status === 'open' ? this.alert.cancel() : this.alert.destroy();
        }));

        this.update();
    }

    serialize(){
        return {
            version: 1,
            name: 'chart-alert'
        };
    }

    drag(){
        const _this = this;

        return function(d){
            _this.alert.value = _this.panel.scale.invert(d3.event.y);
            _this.alert.save();
        };
    }

    kill(){
        const _this = this;

        return function(d, i){
            if(d3.event.shiftKey) return;

            d3.event.stopPropagation();
            d3.event.preventDefault();

            if(_this.alert.status === 'open'){
                _this.alert.cancel();
            }else{
                _this.alert.destroy();
            }
        };
    }

    hide(){
        this.element.classed('hide', true);
        this.tools.classed('hide', true);
        this.flag.classed('hide', true);
    }

    update(){
        this.line.attr('d', `M 0 0 h ${this.panel.width}`);
        this.draw();
    }

    draw(){
        if(!this.alert.isValidAlert()){
            return this.hide();
        }

        const quote = this.alert.market.quote;
        const y = Math.round(this.panel.scale(this.alert.value));
        const direction = DIRECTIONS[this.alert.direction];

        this.element.classed('hide', false);
        this.line.attr('transform', `translate(0, ${y - 0.5})`);
        this.tools.classed('hide', false).style('top', `${y - 10}px`)
            .classed('pending', this.alert.status === 'pending')
            .classed('open', this.alert.status === 'open');

        this.flag.classed('hide', false)
            .attr('transform', `translate(0, ${y - Math.floor(FLAG_HEIGHT / 2)})`)
            .select('text')
                .text(this.alert.value.toFixed(this.chart.precision));

        this.base.text(`Alert me when the ${this.alert.type} ${direction}`);

        if(OPEN.includes(this.alert.status)){
            this.line.classed('hide', true);
            this.estimate.text('');
        }else if(PENDING.includes(this.alert.status)){
            this.line.classed('hide', false);
            this.estimate.text(`${this.alert.value.toFixed(this.chart.precision)} ${quote}`);
        }else{
            this.hide();
        }
    }

    remove(){
        this.panel.removeLayer(this.layer);
    }

    destroy(){
        //Remove the things from the chart
        this.disposables.dispose();
    }
}

module.exports = {
    name: 'chart-alert',
    type: 'other',
    settings: {},
    title: 'Chart Alert',
    description: 'View and modify alerts on the chart.',
    selectable: true,
    priority: 9000,
    instance: params => new ChartAlert(params)
};