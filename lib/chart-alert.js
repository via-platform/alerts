const {CompositeDisposable, Disposable, Emitter, d3} = require('via');
const _ = require('underscore-plus');

const AXIS_HEIGHT = 22;
const FLAG_HEIGHT = AXIS_HEIGHT - 3;

const OPEN = ['open', 'canceling'];
const PENDING = ['pending', 'transmitting', 'received'];
const CLOSED = ['canceled'];

class ChartAlert {
    constructor({chart, element, panel, layer, params}){
        this.disposables = new CompositeDisposable();
        this.chart = chart;
        this.order = params;
        this.layer = layer;
        this.panel = panel;
        this.element = element.classed('chart-order-line', true);

        this.disposables.add(this.order.onDidUpdate(this.update.bind(this)));
        this.disposables.add(this.order.onDidUpdateMarket(this.remove.bind(this)));
        this.disposables.add(this.order.onDidDestroy(this.remove.bind(this)));

        this.tools = d3.select(this.panel.center).append('div').classed('chart-order-tools', true);
        this.base = this.tools.append('div').classed('base', true);
        this.estimate = this.tools.append('div').classed('estimate', true);
        this.cancel = this.tools.append('div').classed('cancel', true);
        this.line = this.element.append('path').attr('transform', `translate(0, 0.5)`);

        this.stop = d3.select(this.panel.center).append('div').classed('chart-order-tools', true);
        this.stopBase = this.stop.append('div').classed('base', true).text('Stop Price');
        this.stopCancel = this.stop.append('div').classed('cancel', true);
        this.stopLine = this.element.append('path').attr('transform', `translate(0, 0.5)`);

        this.flag = this.panel.axis.flag();
        this.flag.classed('chart-order-flag', true);

        this.stopFlag = this.panel.axis.flag();
        this.stopFlag.classed('chart-order-flag', true);

        this.tools.call(d3.drag().on('drag', this.drag('limit')));
        this.cancel.on('click', this.kill());

        this.stop.call(d3.drag().on('drag', this.drag('stop')));
        this.stopCancel.on('click', this.kill());

        this.disposables.add(new Disposable(() => this.flag.remove()));
        this.disposables.add(new Disposable(() => this.tools.remove()));
        this.disposables.add(new Disposable(() => this.stop.remove()));
        this.disposables.add(new Disposable(() => this.stopFlag.remove()));
        this.disposables.add(this.panel.onDidDestroy(this.destroy.bind(this)));
        this.disposables.add(this.panel.onDidResize(this.update.bind(this)));

        this.update();
    }

    serialize(){
        return {
            version: 1,
            name: 'chart-order'
        };
    }

    drag(property){
        const _this = this;

        return function(d){
            //TODO allow orders to be modified by dragging them around
            if(_this.order.status === 'pending'){
                _this.order[property] = _this.panel.scale.invert(d3.event.y);
            }
        };
    }

    kill(){
        const _this = this;

        return function(d, i){
            if(d3.event.shiftKey) return;

            d3.event.stopPropagation();
            d3.event.preventDefault();

            if(_this.order.status === 'open'){
                _this.order.cancel();
            }else{
                _this.order.destroy();
            }
        };
    }

    hide(){
        this.element.classed('hide', true);
        this.tools.classed('hide', true);
        this.flag.classed('hide', true);
        this.stop.classed('hide', true);
        this.stopFlag.classed('hide', true);
    }

    update(){
        this.tools.classed('buy', this.order.side === 'buy').classed('sell', this.order.side === 'sell');
        this.stop.classed('buy', this.order.side === 'buy').classed('sell', this.order.side === 'sell');

        if(this.order.status === 'open'){
            this.line.attr('d', `M ${this.panel.width - 150} 0 h 150`);
            this.stopLine.attr('d', `M ${this.panel.width - 150} 0 h 150`);
        }else{
            this.line.attr('d', `M 0 0 h ${this.panel.width}`);
            this.stopLine.attr('d', `M 0 0 h ${this.panel.width}`);
        }

        this.draw();
    }

    draw(){
        if(!this.order.isValidOrder()){
            return this.hide();
        }

        if(OPEN.includes(this.order.status)){
            //Draw only the limit line
            const side = this.order.side === 'buy' ? 'Buy' : 'Sell';
            if(!this.order.amount) debugger;
            const amount = this.order.amount.toFixed(this.order.market.precision.amount);
            const base = this.order.market.base;
            const quote = this.order.market.quote;
            const value = this.order.type === 'limit' ? this.order.limit : this.order.stop;
            const y = Math.round(this.panel.scale(value));

            this.element.classed('hide', false);
            this.line.classed('hide', false).attr('transform', `translate(0, ${y - 0.5})`);
            this.stopLine.classed('hide', true);
            this.stopFlag.classed('hide', true);
            this.stop.classed('hide', true);
            this.tools.classed('hide', false).style('top', `${y - 10}px`).classed('open', true);

            this.flag.classed('hide', false)
                .attr('transform', `translate(0, ${y - Math.floor(FLAG_HEIGHT / 2)})`)
                .select('text')
                    .text(value.toFixed(this.chart.precision));

            if(this.order.type === 'limit'){
                this.base.text(`${side.toUpperCase()} LIMIT`);
                this.estimate.text(`${amount} ${base}`);
            }else if(this.order.type === 'stop-limit'){
                this.base.text(`STOP LIMIT @ ${this.order.limit.toFixed(this.chart.precision)}`);
                this.estimate.text(`${this.order.side.toUpperCase()} ${amount} ${base}`);
            }else if(this.order.type === 'stop-market'){
                this.base.text('STOP MARKET');
                this.estimate.text(`${this.order.side.toUpperCase()} ${amount} ${quote}`);
            }
        }else if(PENDING.includes(this.order.status)){
            //Draw the pending order and maybe stop price
            const side = this.order.side === 'buy' ? 'Buy' : 'Sell';
            const amount = this.order.amount.toFixed(this.order.market.precision.amount);
            const base = this.order.market.base;
            const quote = this.order.market.quote;
            const stop = this.order.type.indexOf('stop-') === 0;
            const limit = this.order.type.indexOf('limit') !== -1;

            this.element.classed('hide', false);
            this.stopLine.classed('hide', !stop);
            this.stopFlag.classed('hide', !stop);
            this.stop.classed('hide', !stop);
            this.line.classed('hide', !limit);
            this.tools.classed('hide', !limit);
            this.flag.classed('hide', !limit);

            if(limit){
                const limitY = Math.round(this.panel.scale(this.order.limit));
                const estimate = (this.order.amount * this.order.limit).toFixed(this.order.market.precision.price);

                this.line.attr('transform', `translate(0, ${limitY - 0.5})`);
                this.tools.style('top', `${limitY - 10}px`);

                this.flag.attr('transform', `translate(0, ${limitY - Math.floor(FLAG_HEIGHT / 2)})`)
                    .select('text')
                        .text(this.order.limit.toFixed(this.chart.precision));

                this.base.text(`(Limit) ${side} ${amount} ${base}`);
                this.estimate.text(`For ${estimate} ${quote}`);
            }

            if(stop){
                const stopY = Math.round(this.panel.scale(this.order.stop));
                this.stop.style('top', `${stopY - 10}px`);
                this.stopLine.attr('transform', `translate(0, ${stopY - 0.5})`);

                this.stopFlag.attr('transform', `translate(0, ${stopY - Math.floor(FLAG_HEIGHT / 2)})`)
                    .select('text')
                        .text(this.order.stop.toFixed(this.chart.precision));
            }
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
    priority: 10000,
    instance: params => new ChartAlert(params)
};