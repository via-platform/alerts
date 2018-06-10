const {CompositeDisposable, Disposable, Emitter, d3} = require('via');
const _ = require('underscore-plus');
const ChartAlert = require('./chart-alert');

module.exports = class ChartAlerts {
    constructor({manager, chart}){
        this.disposables = new CompositeDisposable();
        this.manager = manager;
        this.chart = chart;
        this.alerts = [];

        this.disposables.add(this.chart.onDidDestroy(this.destroy.bind(this)));
        this.disposables.add(this.chart.onDidChangeMarket(this.changeMarket.bind(this)));
        this.disposables.add(this.manager.onDidCreateAlert(this.add.bind(this)));
        this.disposables.add(this.manager.onDidUpdateAlert(this.update.bind(this)));
        this.disposables.add(via.commands.add(this.chart.center().center, 'alerts:create-alert', this.createOnChart.bind(this)));

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

        this.changeMarket();
    }

    add(alert){
        //Add price alerts to the center, volume alerts to the volume panel (if available)
        if(this.chart.market && alert.market === this.chart.market){
            if(alert.type === 'last-price'){
                this.chart.center().addLayer(ChartAlert, alert);
            }else if(alert.type === 'volume'){
                // for(const panel of this.chart.panels){
                //     if(panel.getRoot().metadata.name === 'volume'){
                //         panel.addLayer(ChartAlert, alert);
                //     }
                // }
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

    destroy(){
        this.alerts.forEach(ca => ca.destroy());
        this.disposables.dispose();
        this.manager.didDestroyChartAlerts(this);
    }
}