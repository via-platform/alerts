const {CompositeDisposable, Disposable, Emitter, d3} = require('via');
const _ = require('underscore-plus');
const ChartAlert = require('./chart-alert');

module.exports = class ChartAlerts {
    constructor(manager, {chart}){
        this.disposables = new CompositeDisposable();
        this.manager = manager;
        this.chart = chart;
        this.panel = this.chart.center();
        this.alerts = [];

        //TODO Add elements to other panels in the future for technical analysis alerts
        this.element = this.panel.zoomable.append('g').attr('class', 'layer chart-alerts');

        this.disposables.add(this.chart.onDidDestroy(this.destroy.bind(this)));
        this.disposables.add(this.chart.onDidChangeMarket(this.changeMarket.bind(this)));
        this.disposables.add(this.manager.onDidCreateAlert(this.add.bind(this)));
        this.disposables.add(this.manager.onDidUpdateAlert(this.update.bind(this)));
        this.disposables.add(via.commands.add(this.panel.element, 'alerts:create-alert', this.createOnChart.bind(this)));

        this.disposables.add(via.contextMenu.add({
            '.chart .panel.center .panel-center': [
                {
                    label: 'Create Alert',
                    command: 'alerts:create-alert',
                    created: function(event){
                        this.commandDetail = {x: event.pageX, y: event.pageY};
                    }
                }
            ]
        }));

        this.panel.add(this);

        this.changeMarket();
    }

    add(alert){
        if(this.chart.market && alert.market === this.chart.market){
            if(alert.type === 'last-price'){
                this.alerts.push(new ChartAlert({chart: this.chart, panel: this.panel, element: this.element, manager: this.manager, alert}));
            }else{
                //TODO Not supported yet
            }
        }
    }

    createOnChart(e){
        const {y} = e.detail[0];
        const panel = this.chart.center();
        const {top} = panel.center.getBoundingClientRect();
        const value = panel.scale.invert(y - top);

        this.manager.create({
            market: this.chart.getMarket(),
            value: value,
            direction: 'cross'
        });
    }

    update({alert, property, value}){
        if(property === 'market' && value === this.chart.market || property === 'type'){
            this.add(alert);
        }
    }

    changeMarket(){
        for(const ca of this.alerts.slice()){
            ca.destroy();
        }

        this.alerts = [];

        if(this.chart.market){
            this.manager.all()
                .filter(alert => alert.market === this.chart.market && alert.isValidAlert() && !alert.isDone())
                .forEach(this.add.bind(this));
        }
    }

    didDestroyChartAlert(co){
        _.remove(this.alerts, co);
    }

    get domain(){
        return [];
    }

    get decimals(){
        return this.chart.market ? this.chart.market.precision.price : 0;
    }

    select(){}

    recalculate(){}

    render(){
        for(const alert of this.alerts){
            alert.render();
        }
    }

    title(){
        return '';
    }

    value(){
        return '';
    }

    remove(){
        via.console.warn('This layer cannot be removed.');
    }

    destroy(){
        for(const alert of this.alerts){
            alert.destroy();
        }

        this.disposables.dispose();
        this.manager.didDestroyChartAlerts(this);
    }
}