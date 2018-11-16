const {CompositeDisposable, Disposable, Emitter, d3} = require('via');
const _ = require('underscore-plus');

const AXIS_HEIGHT = 22;
const FLAG_HEIGHT = AXIS_HEIGHT - 3;

const DIRECTIONS = {above: 'rises above', below: 'falls below', cross: 'crosses'};

module.exports = class ChartAlert {
    constructor({chart, element, panel, alert, manager}){
        this.disposables = new CompositeDisposable();
        this.chart = chart;
        this.manager = manager;
        this.alert = alert;
        this.panel = panel;
        this.element = element;

        this.disposables.add(this.alert.onDidUpdate(this.render.bind(this)));
        this.disposables.add(this.alert.onDidUpdateMarket(this.destroy.bind(this)));
        this.disposables.add(this.alert.onDidUpdateType(this.destroy.bind(this)));
        this.disposables.add(this.alert.onDidDestroy(this.destroy.bind(this)));

        this.tools = d3.select(this.panel.center).append('div').classed('chart-alert-tools', true);
        this.base = this.tools.append('div').classed('base', true);
        this.estimate = this.tools.append('div').classed('estimate', true);
        this.cancel = this.tools.append('div').classed('cancel', true);
        this.line = this.element.append('path').classed('chart-alert-line', true);

        this.flag = this.panel.axis.flag();
        this.flag.classed('chart-alert-flag', true);

        this.tools.call(d3.drag().on('drag', this.drag()));
        this.estimate.on('click', this.transmit());
        this.cancel.on('click', this.kill());

        this.disposables.add(via.config.observe('alerts.showLinesForOpenAlerts', this.render.bind(this)));
        this.disposables.add(via.commands.add(this.tools.node(), 'alerts:cancel-alert', () => this.alert.status === 'open' ? this.alert.cancel() : this.alert.destroy()));
        this.disposables.add(via.commands.add(this.tools.node(), 'alerts:transmit-alert', () => this.alert.transmit()));
    }

    drag(){
        const _this = this;

        return function(d){
            _this.alert.value = _this.panel.scale.invert(d3.event.y);
            _this.alert.save();
        };
    }

    transmit(){
        const _this = this;

        return function(d){
            if(d3.event.shiftKey) return;

            d3.event.stopPropagation();
            d3.event.preventDefault();

            if(_this.alert.status === 'pending'){
                _this.alert.transmit();
            }
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
        this.line.classed('hide', true);
        this.tools.classed('hide', true);
        this.flag.classed('hide', true);
    }

    render(){
        if(!this.alert.isValidAlert()){
            return this.hide();
        }

        const quote = this.alert.market.quote;
        const y = Math.round(this.panel.scale(this.alert.value));
        const direction = DIRECTIONS[this.alert.direction];
        const price = via.fn.number.formatPrice(this.alert.value, this.chart.market);

        this.line.classed('hide', false).attr('d', `M 0 ${y + 0.5} h ${this.panel.width}`);

        this.tools.classed('hide', false)
            .style('right', this.alert.isPending() ? null : `${this.chart.offset}px`)
            .style('top', `${y - 10}px`)
            .classed('pending', this.alert.isPending())
            .classed('open', this.alert.isOpen());

        this.flag.classed('hide', false)
            .attr('transform', `translate(0, ${y - Math.floor(FLAG_HEIGHT / 2)})`)
            .select('text')
                .attr('x', price.length * 3 + 6)
                .text(price);

        this.flag.select('rect')
            .attr('width', price.length * 6 + 12);

        this.base.text(`Alert me when the ${this.alert.type} ${direction}`);

        if(this.alert.isOpen()){
            this.line.classed('hide', !via.config.get('alerts.showLinesForOpenAlerts'));
            this.estimate.text('');
        }else if(this.alert.isPending()){
            this.line.classed('hide', false);
            this.estimate.text(`${via.fn.number.formatPrice(this.alert.value, this.chart.market)} ${quote}`);
        }else{
            this.hide();
        }
    }

    destroy(){
        //Remove the things from the chart
        this.line.remove();
        this.tools.remove();
        this.flag.remove();

        this.disposables.dispose();
    }
}